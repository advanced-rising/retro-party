import {
  isUnlimited,
  minPlayersFor,
  ROOM_CAPACITY,
  type ChatChannel,
  type ChatLine,
  type Participant,
  type PlayerId,
  type RoomSettings,
  type RoomState,
  type ServerErrorCode,
  type RoundRecord,
  type RoundSolver,
  type ServerMessage,
  type TeamId,
} from '@retro/types'
import { canReceive, createRateLimiter, isJudgeable, sanitize, type RateLimiter } from './chat.ts'
import { emptyRound, type ContentPool, type RoomGame, type RoundState } from './game.ts'
import { createRng, deriveSeed } from './rng.ts'
import { normalizeRoomTitle } from './title.ts'
import { assignTeams, planTeams, rotateForNextMatch } from './teams.ts'

/**
 * 방 상태 머신 — 01 문서 §3
 *
 * Durable Object 를 모른다. WebSocket 도 모른다.
 * 이벤트를 받아 상태를 바꾸고 Effect 목록을 돌려줄 뿐이다.
 * 시간은 전부 인자로 들어온다 — 이 파일에 Date.now() 는 없다.
 *
 * 참가자는 전부 사람이다. 봇으로 자리를 채우는 코드는 여기 없다.
 */

/**
 * 스킵 — 아무도 못 맞히고 있을 때 남은 시간을 통째로 버리지 않게 한다.
 *
 * 표가 다 모이면 라운드를 **즉시 끝내지 않고** 이만큼만 남긴다.
 * 바로 끊으면 마지막 순간에 떠오른 사람이 억울하고, 정답 공개가 급작스럽다.
 */
export const SKIP_TO_MS = 5_000

/** 힌트를 앞당기려면 과반이 필요하다. 스킵과 달리 전원까지는 안 간다 */
export const HINT_VOTE_RATIO = 0.5

export const COUNTDOWN_MS = 3_000
export const REVEAL_MS = 4_000
/** 출제자가 이만큼 조용하면 라운드를 넘긴다 — 02 문서 §3.8 */
export const PRESENTER_IDLE_MS = 20_000

export type Effect =
  | { readonly kind: 'broadcast'; readonly message: ServerMessage }
  | { readonly kind: 'send'; readonly to: PlayerId; readonly message: ServerMessage }
  /**
   * 채팅은 수신자별로 다르게 나간다.
   *   · senderTeam — 팀 채널이 상대 팀에 새지 않게 (01 문서 §6.5.2)
   *   · revealTo   — ★ 정답 원문을 볼 수 있는 사람. null 이면 전원
   *
   * revealTo 가 없으면 먼저 맞힌 사람의 답이 채팅에 그대로 떠서
   * 나머지가 그대로 베낀다. 게임이 성립하지 않는다.
   */
  | {
      readonly kind: 'chat'
      readonly line: ChatLine
      readonly senderTeam: TeamId | null
      readonly revealTo: readonly PlayerId[] | null
    }
  /** 이 시각에 tick() 을 다시 불러 달라 */
  | { readonly kind: 'alarm'; readonly atMs: number }
  | { readonly kind: 'matchOver'; readonly ranking: readonly PlayerId[] }

export interface EngineState<Question> {
  readonly room: RoomState
  readonly round: RoundState | null
  /** 서버만 들고 있는다. 절대 Effect 에 실리지 않는다 */
  readonly question: Question | null
}

export interface JoinInput {
  readonly participant: Participant
  readonly nowMs: number
}

export interface ChatInput {
  readonly playerId: PlayerId
  readonly text: string
  readonly channel: ChatChannel
  readonly nowMs: number
}

export interface Engine<Question, View> {
  readonly state: EngineState<Question>
  join(input: JoinInput): readonly Effect[]
  leave(playerId: PlayerId, nowMs: number): readonly Effect[]
  chat(input: ChatInput): readonly Effect[]
  start(playerId: PlayerId, nowMs: number): readonly Effect[]
  again(playerId: PlayerId, nowMs: number): readonly Effect[]
  settings(playerId: PlayerId, patch: Partial<RoomSettings>, nowMs: number): readonly Effect[]
  /** 이 라운드를 빨리 넘기자는 표 */
  skip(playerId: PlayerId, nowMs: number): readonly Effect[]
  /** 다음 힌트를 먼저 보자는 표 */
  hint(playerId: PlayerId, nowMs: number): readonly Effect[]
  /** 방 생성 시점에만 쓴다. 방장 검증도 로비 검증도 하지 않는다 */
  settingsUnchecked(patch: Partial<RoomSettings>): void
  /**
   * 비밀번호가 걸렸는지만 기록한다. **비밀번호 자체는 엔진에 들어오지 않는다** —
   * 방 상태는 전원에게 브로드캐스트되기 때문이다. 검증은 RoomDO 가 한다
   */
  setLocked(locked: boolean): void
  tick(nowMs: number): readonly Effect[]
  snapshotFor(playerId: PlayerId): ServerMessage
  boardsAt(nowMs: number): readonly Effect[]
  viewFor(playerId: PlayerId, nowMs: number): View | null
}

export interface EngineInit<Question, View> {
  readonly game: RoomGame<Question, View>
  readonly room: RoomState
  readonly pool: ContentPool
  /** 금칙어. 단어 연상에서 게임 모듈이 채운다 — 02 문서 §3.4 */
  readonly blockedWords?: readonly string[]
}

export function createEngine<Question, View>(
  init: EngineInit<Question, View>,
): Engine<Question, View> {
  const { game } = init
  const blockedWords = init.blockedWords ?? []

  let room: RoomState = init.room
  let round: RoundState | null = null
  let question: Question | null = null
  /** 팀 배정 순서. 이번 판을 쉰 사람이 다음 판 맨 앞으로 온다 */
  let seatOrder: readonly PlayerId[] = init.room.participants.map((p) => p.playerId)
  /** 출제자가 마지막으로 말한 시각. 오래 조용하면 라운드를 넘긴다 — 02 문서 §3.8 */
  let presenterSpokeAtMs = 0
  /** 이번 판의 라운드 기록. 결과 화면에서 되짚는다 */
  let history: RoundRecord[] = []
  /** 이번 라운드에 누가 언제 맞혔는가 */
  let solvers: RoundSolver[] = []
  /** 이번 라운드에 스킵을 누른 사람 */
  let skipVotes = new Set<PlayerId>()
  /** 이번 라운드에 힌트를 앞당기자고 누른 사람 */
  let hintVotes = new Set<PlayerId>()

  const rateLimiter: RateLimiter = createRateLimiter()

  const find = (id: PlayerId): Participant | undefined =>
    room.participants.find((p) => p.playerId === id)

  const teamOf = (id: PlayerId): TeamId | null => find(id)?.team ?? null

  const scoreList = (): readonly (readonly [PlayerId, number])[] => [...room.scores]

  const active = (): readonly Participant[] =>
    room.participants.filter((p) => p.connected && !p.benched)

  const err = (to: PlayerId, code: ServerErrorCode, message: string): Effect => ({
    kind: 'send',
    to,
    message: { type: 'error', code, message },
  })

  const setPhase = (phase: RoomState['phase']): Effect => {
    room = { ...room, phase }
    return { kind: 'broadcast', message: { type: 'phase', phase } }
  }

  const snapshot = (playerId: PlayerId): ServerMessage => ({
    type: 'snapshot',
    phase: room.phase,
    settings: room.settings,
    participants: room.participants,
    scores: scoreList(),
    hostId: room.hostId,
    you: playerId,
    yourTeam: teamOf(playerId),
  })

  /** 정답을 맞힐 수 있는 사람 수. 출제자·쉬는 사람·끊긴 사람은 뺀다 */
  const countSolvers = (presenter: PlayerId | null): number =>
    active().filter((p) => p.playerId !== presenter).length

  // ── 팀 편성 ────────────────────────────────────────

  function seatTeams(): Effect[] {
    if (room.settings.mode !== 'team') {
      room = {
        ...room,
        participants: room.participants.map((p) => ({ ...p, team: null, benched: false })),
      }
      return []
    }

    const connected = seatOrder.filter((id) => find(id)?.connected === true)
    const plan = planTeams(connected.length)
    if (plan === null) {
      // 4명이 안 되면 팀전이 성립하지 않는다. 개인전으로 떨어뜨린다
      room = {
        ...room,
        settings: { ...room.settings, mode: 'casual', teamSize: null },
        participants: room.participants.map((p) => ({ ...p, team: null, benched: false })),
      }
      return []
    }

    const { teams, benched } = assignTeams({ ordered: connected, plan })
    seatOrder = rotateForNextMatch(connected, benched)
    room = {
      ...room,
      settings: { ...room.settings, teamSize: plan.teamSize },
      participants: room.participants.map((p) => ({
        ...p,
        team: teams.get(p.playerId) ?? null,
        benched: benched.includes(p.playerId),
      })),
    }
    return []
  }

  // ── 라운드 진행 ────────────────────────────────────

  function beginRound(roundNo: number, nowMs: number): Effect[] {
    // 혼자 모드에는 출제자를 세우지 않는다. 게임 모듈의 스크립트가 대신한다 (03 문서 §7.3)
    const presenter =
      game.meta.hasPresenter && room.settings.mode !== 'solo' ? pickPresenter(roundNo) : null

    question = game.createRound({
      seed: room.seed,
      roundNo,
      rng: createRng(deriveSeed(room.seed, 'q', roundNo)),
      pool: init.pool,
      topics: room.settings.topics,
      presenter,
    })
    round = emptyRound({
      roundNo,
      startedAtMs: nowMs,
      roundMs: game.meta.roundMs,
      expectedSolvers: countSolvers(presenter),
      presenter,
    })

    presenterSpokeAtMs = nowMs
    solvers = []
    skipVotes = new Set()
    hintVotes = new Set()

    return [
      setPhase({ kind: 'playing', roundNo, endsAtMs: round.endsAtMs, roundMs: game.meta.roundMs }),
      ...boardsAt(nowMs),
      { kind: 'alarm', atMs: nowMs + 1_000 },
    ]
  }

  /** 출제자는 라운드마다 돌아간다. 아무도 두 번 하기 전에 한 번씩 한다 */
  function pickPresenter(roundNo: number): PlayerId | null {
    const eligible = active()
    if (eligible.length === 0) return null
    return eligible[roundNo % eligible.length]?.playerId ?? null
  }

  function endRound(nowMs: number): Effect[] {
    if (question === null || round === null) return []

    // 출제자 보너스처럼 라운드가 끝나야 계산되는 점수를 얹는다
    const bonus = game.roundEndBonus?.(question, round) ?? []
    if (bonus.length > 0) {
      const scores = new Map(room.scores)
      for (const [playerId, points] of bonus) {
        scores.set(playerId, (scores.get(playerId) ?? 0) + points)
      }
      room = { ...room, scores }
    }

    const revealed = game.reveal(question)
    const endsAtMs = nowMs + REVEAL_MS
    const roundNo = round.roundNo

    // 정답은 공개된 지금부터 기록에 들어간다. 그 전에는 어디에도 안 남는다
    history = [...history, { roundNo, answer: revealed.answer, solvers: [...solvers] }]

    const effects: Effect[] = [
      setPhase({ kind: 'reveal', roundNo, endsAtMs }),
      {
        kind: 'broadcast',
        message: { type: 'board', view: { revealed: revealed.answer, detail: revealed.detail } },
      },
      { kind: 'broadcast', message: { type: 'score', scores: scoreList() } },
      { kind: 'alarm', atMs: endsAtMs },
    ]
    question = null
    return effects
  }

  function finish(): Effect[] {
    const ranking = [...room.scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([playerId]) => playerId)

    round = null
    question = null
    return [
      setPhase({ kind: 'result' }),
      { kind: 'broadcast', message: { type: 'score', scores: scoreList() } },
      { kind: 'broadcast', message: { type: 'history', rounds: history } },
      { kind: 'matchOver', ranking },
    ]
  }

  function startMatch(playerId: PlayerId, nowMs: number): readonly Effect[] {
    if (room.hostId !== playerId) return [err(playerId, 'not_host', '방장만 시작할 수 있습니다')]
    if (room.phase.kind !== 'lobby' && room.phase.kind !== 'result') {
      return [err(playerId, 'game_in_progress', '이미 진행 중입니다')]
    }
    const need = minPlayersFor(room.settings.mode)
    if (room.participants.filter((p) => p.connected).length < need) {
      return [err(playerId, 'not_enough_players', `${need}명부터 시작할 수 있습니다`)]
    }

    const effects: Effect[] = [...seatTeams()]

    // 새 판이 시작되면 지난 기록은 지운다
    history = []
    solvers = []

    const scores = new Map<PlayerId, number>()
    for (const p of room.participants) scores.set(p.playerId, 0)
    room = { ...room, scores }

    const startsAtMs = nowMs + COUNTDOWN_MS
    effects.push(setPhase({ kind: 'countdown', startsAtMs }))
    for (const p of room.participants) {
      effects.push({ kind: 'send', to: p.playerId, message: snapshot(p.playerId) })
    }
    effects.push({ kind: 'alarm', atMs: startsAtMs })
    return effects
  }

  // ── 판정 ───────────────────────────────────────────

  function applyChat(
    playerId: PlayerId,
    text: string,
    channel: ChatChannel,
    nowMs: number,
  ): Effect[] {
    // 금칙어는 사람마다 다르다. 출제자만 정답을 못 쓴다 — 02 문서 §3.4
    const perPlayer =
      question !== null && round !== null
        ? (game.blockedWordsFor?.({ question, round, playerId }) ?? [])
        : []
    const clean = sanitize(text, [...blockedWords, ...perPlayer])
    if (clean.blocked) return [err(playerId, 'blocked_word', '이 라운드에 쓸 수 없는 말입니다')]
    if (clean.text === null) return []

    let correct: ChatLine['correct'] = null
    let note: string | null = null
    const effects: Effect[] = []

    const speaker = find(playerId)
    const judgeable =
      room.phase.kind === 'playing' &&
      question !== null &&
      round !== null &&
      speaker !== undefined &&
      !speaker.benched &&
      round.presenter !== playerId &&
      isJudgeable(room.settings.mode, channel)

    if (judgeable && question !== null && round !== null) {
      const judgement = game.judge({ question, round, playerId, text: clean.text, atMs: nowMs })

      if (judgement.kind === 'wrong' || judgement.kind === 'partial') {
        note = judgement.note ?? null
      }
      if (judgement.kind === 'correct') {
        correct = { points: judgement.points, rank: judgement.rank }
        round = { ...round, solved: [...round.solved, playerId] }
        solvers.push({
          playerId,
          points: judgement.points,
          elapsedMs: nowMs - round.startedAtMs,
        })
      }
      if (judgement.kind === 'partial') {
        // 부분 점수를 한 번 받았다는 사실을 남긴다. 안 남기면 ±1년을 남발한다
        round = { ...round, partials: [...round.partials, playerId] }
      }
      if (judgement.kind === 'correct' || judgement.kind === 'partial') {
        const scores = new Map(room.scores)
        scores.set(playerId, (scores.get(playerId) ?? 0) + judgement.points)
        room = { ...room, scores }
        effects.push({ kind: 'broadcast', message: { type: 'score', scores: scoreList() } })
      }
    }

    // 출제자가 말했다는 사실을 기록한다 (침묵 감시용)
    if (round !== null && round.presenter === playerId) presenterSpokeAtMs = nowMs

    const line: ChatLine = { from: playerId, text: clean.text, channel, correct, note }
    // 정답을 맞힌 줄은 이미 맞힌 사람에게만 원문이 간다. 나머지는 가려진 걸 본다
    const revealTo =
      correct === null || round === null ? null : [...round.solved, playerId]
    effects.unshift({ kind: 'chat', line, senderTeam: teamOf(playerId), revealTo })

    if (correct !== null && question !== null && round !== null) {
      if (game.isRoundOver(question, round)) {
        effects.push(...endRound(nowMs))
        return effects
      }
      effects.push(...boardsAt(nowMs))
    }

    return effects
  }

  // ── 뷰 ─────────────────────────────────────────────

  function viewFor(playerId: PlayerId, nowMs: number): View | null {
    if (question === null || round === null) return null
    return game.viewFor({ question, round, playerId, team: teamOf(playerId), nowMs })
  }

  function boardsAt(nowMs: number): readonly Effect[] {
    if (question === null || round === null) return []
    const out: Effect[] = []
    for (const p of room.participants) {
      if (!p.connected) continue
      const view = viewFor(p.playerId, nowMs)
      if (view === null) continue
      out.push({ kind: 'send', to: p.playerId, message: { type: 'board', view } })
    }
    return out
  }

  // ── 공개 API ───────────────────────────────────────

  return {
    get state(): EngineState<Question> {
      return { room, round, question }
    },

    join({ participant, nowMs }): readonly Effect[] {
      const existing = find(participant.playerId)
      if (existing !== undefined) {
        // 재접속 — 점수·팀·벤치 상태를 유지하고 연결만 되살린다
        room = {
          ...room,
          participants: room.participants.map((p) =>
            p.playerId === participant.playerId ? { ...p, connected: true } : p,
          ),
        }
        return [
          { kind: 'send', to: participant.playerId, message: snapshot(participant.playerId) },
          { kind: 'broadcast', message: { type: 'joined', participant: find(participant.playerId) ?? participant } },
          ...boardsAt(nowMs),
        ]
      }

      if (room.participants.length >= ROOM_CAPACITY) {
        return [err(participant.playerId, 'room_full', '방이 가득 찼습니다')]
      }

      const scores = new Map(room.scores)
      scores.set(participant.playerId, scores.get(participant.playerId) ?? 0)
      room = { ...room, participants: [...room.participants, participant], scores }
      seatOrder = [...seatOrder, participant.playerId]

      // 방장이 없거나 이미 나간 방이면 이 사람이 방장이 된다
      if (find(room.hostId) === undefined) room = { ...room, hostId: participant.playerId }

      return [
        { kind: 'send', to: participant.playerId, message: snapshot(participant.playerId) },
        { kind: 'broadcast', message: { type: 'joined', participant } },
        ...boardsAt(nowMs),
      ]
    },

    leave(playerId, nowMs): readonly Effect[] {
      if (find(playerId) === undefined) return []
      rateLimiter.forget(playerId)

      const effects: Effect[] = []

      if (room.phase.kind === 'lobby' || room.phase.kind === 'result') {
        room = { ...room, participants: room.participants.filter((p) => p.playerId !== playerId) }
        seatOrder = seatOrder.filter((id) => id !== playerId)
      } else {
        // 진행 중에는 자리를 남긴다 — 재접속하면 점수를 이어받는다
        room = {
          ...room,
          participants: room.participants.map((p) =>
            p.playerId === playerId ? { ...p, connected: false } : p,
          ),
        }
      }
      effects.push({ kind: 'broadcast', message: { type: 'left', playerId } })

      if (room.hostId === playerId) {
        const heir = room.participants.find((p) => p.connected)
        if (heir !== undefined) {
          room = { ...room, hostId: heir.playerId }
          for (const p of room.participants) {
            effects.push({ kind: 'send', to: p.playerId, message: snapshot(p.playerId) })
          }
        }
      }

      // 남은 사람이 라운드를 다 맞혔으면 더 기다릴 이유가 없다
      if (round !== null && question !== null && room.phase.kind === 'playing') {
        round = { ...round, expectedSolvers: countSolvers(round.presenter) }
        if (game.isRoundOver(question, round)) effects.push(...endRound(nowMs))
      }

      return effects
    },

    chat({ playerId, text, channel, nowMs }): readonly Effect[] {
      if (!rateLimiter.allow(playerId, nowMs)) {
        return [err(playerId, 'rate_limited', '조금 천천히 입력해 주세요')]
      }
      return applyChat(playerId, text, channel, nowMs)
    },

    start: startMatch,

    again(playerId, nowMs): readonly Effect[] {
      if (room.phase.kind !== 'result') {
        return [err(playerId, 'game_in_progress', '아직 판이 끝나지 않았습니다')]
      }
      return startMatch(playerId, nowMs)
    },

    settings(playerId, patch, _nowMs): readonly Effect[] {
      if (room.hostId !== playerId) return [err(playerId, 'not_host', '방장만 바꿀 수 있습니다')]
      if (room.phase.kind !== 'lobby') {
        return [err(playerId, 'game_in_progress', '진행 중에는 바꿀 수 없습니다')]
      }

      // 제목은 목록에 그대로 노출되므로 서버에서 반드시 거른다
      const title = patch.title === undefined ? undefined : normalizeRoomTitle(patch.title)
      if (patch.title !== undefined && title === null) {
        return [err(playerId, 'invalid_message', '쓸 수 없는 방 제목입니다')]
      }

      const rest = { ...patch }
      delete rest.title
      room = {
        ...room,
        settings: { ...room.settings, ...rest, ...(title == null ? {} : { title }) },
      }
      return room.participants.map((p) => ({
        kind: 'send' as const,
        to: p.playerId,
        message: snapshot(p.playerId),
      }))
    },

    settingsUnchecked(patch): void {
      const title = patch.title === undefined ? null : normalizeRoomTitle(patch.title)
      const rest = { ...patch }
      delete rest.title
      room = {
        ...room,
        settings: { ...room.settings, ...rest, ...(title === null ? {} : { title }) },
      }
    },

    setLocked(locked): void {
      room = { ...room, locked }
    },

    /**
     * 스킵 표.
     *
     * **이미 맞힌 사람은 자동으로 동의한 것으로 본다** — 어차피 기다리는 중이다.
     * 그래서 「맞힌 사람 + 스킵을 누른 사람」이 답할 수 있는 사람 전부가 되면
     * 남은 시간을 5초로 줄인다. 표는 서버가 세고 클라이언트는 결과만 받는다.
     */
    skip(playerId, nowMs): readonly Effect[] {
      const phase = room.phase
      if (phase.kind !== 'playing' || round === null) return []

      const speaker = find(playerId)
      if (speaker === undefined || !speaker.connected || speaker.benched) return []
      if (round.presenter === playerId) return []

      skipVotes.add(playerId)

      const eligible = active().filter((p) => p.playerId !== round?.presenter)
      const agreed = eligible.filter(
        (p) => skipVotes.has(p.playerId) || round?.solved.includes(p.playerId) === true,
      ).length

      const effects: Effect[] = eligible.map((p) => ({
        kind: 'send' as const,
        to: p.playerId,
        message: {
          type: 'skip' as const,
          votes: agreed,
          needed: eligible.length,
          you: skipVotes.has(p.playerId),
        },
      }))

      if (agreed < eligible.length) return effects

      // 전원 동의 — 남은 시간을 줄인다. 이미 5초 밑이면 그대로 둔다
      const endsAtMs = Math.min(phase.endsAtMs, nowMs + SKIP_TO_MS)
      if (endsAtMs >= phase.endsAtMs) return effects

      round = { ...round, endsAtMs }
      effects.push(setPhase({ ...phase, endsAtMs }))
      effects.push({ kind: 'alarm', atMs: endsAtMs })
      return effects
    },

    /**
     * 힌트 먼저 보기.
     *
     * 과반이 모이면 **라운드 시계를 다음 공개 시각까지 앞당긴다.**
     * 힌트를 따로 여는 게 아니라 시간을 당기는 이유는, 그래야 네 게임에
     * 똑같이 먹히고 **남은 시간도 같이 줄어들기** 때문이다.
     * 점수도 그만큼 깎인다 — 힌트를 봤으면 대가를 치르는 게 맞다.
     */
    hint(playerId, nowMs): readonly Effect[] {
      const phase = room.phase
      if (phase.kind !== 'playing' || round === null || question === null) return []

      const speaker = find(playerId)
      if (speaker === undefined || !speaker.connected || speaker.benched) return []
      if (round.presenter === playerId) return []

      const nextAt = game.nextRevealAtMs?.(question, round, nowMs) ?? null
      const eligible = active().filter((p) => p.playerId !== round?.presenter)
      const needed = Math.max(1, Math.ceil(eligible.length * HINT_VOTE_RATIO))

      if (nextAt !== null) hintVotes.add(playerId)
      const votes = eligible.filter((p) => hintVotes.has(p.playerId)).length

      const notices: Effect[] = eligible.map((p) => ({
        kind: 'send' as const,
        to: p.playerId,
        message: {
          type: 'hint' as const,
          votes,
          needed,
          you: hintVotes.has(p.playerId),
          available: nextAt !== null,
        },
      }))

      if (nextAt === null || votes < needed) return notices

      // 시계를 당긴다. 힌트가 열리고 남은 시간도 그만큼 줄어든다
      const shift = Math.max(0, nextAt - nowMs)
      if (shift === 0) return notices

      round = {
        ...round,
        startedAtMs: round.startedAtMs - shift,
        endsAtMs: round.endsAtMs - shift,
      }
      hintVotes = new Set()

      return [
        ...notices,
        setPhase({ ...phase, endsAtMs: phase.endsAtMs - shift }),
        ...boardsAt(nowMs),
        { kind: 'alarm', atMs: Math.min(nowMs + 1_000, phase.endsAtMs - shift) },
      ]
    },

    tick(nowMs): readonly Effect[] {
      const phase = room.phase

      switch (phase.kind) {
        case 'countdown':
          if (nowMs >= phase.startsAtMs) return beginRound(0, nowMs)
          return [{ kind: 'alarm', atMs: phase.startsAtMs }]

        case 'playing': {
          if (nowMs >= phase.endsAtMs) return endRound(nowMs)
          // 출제자가 자리를 비우면 나머지가 90초를 통째로 버린다 — 02 문서 §3.8
          if (
            round !== null &&
            round.presenter !== null &&
            nowMs - presenterSpokeAtMs >= PRESENTER_IDLE_MS
          ) {
            return endRound(nowMs)
          }
          return [
            ...boardsAt(nowMs),
            { kind: 'alarm', atMs: Math.min(nowMs + 1_000, phase.endsAtMs) },
          ]
        }

        case 'reveal': {
          if (nowMs < phase.endsAtMs) return [{ kind: 'alarm', atMs: phase.endsAtMs }]
          const next = phase.roundNo + 1

          // 무제한 — 사람이 한 명이라도 남아 있으면 계속 돈다.
          // 아무도 없으면 멈춘다. 빈 방에서 문제가 도는 건 낭비다
          if (isUnlimited(room.settings)) {
            return room.participants.some((p) => p.connected) ? beginRound(next, nowMs) : finish()
          }
          return next >= room.settings.rounds ? finish() : beginRound(next, nowMs)
        }

        case 'lobby':
        case 'result':
          return []
      }
    },

    snapshotFor: snapshot,
    boardsAt,
    viewFor,
  }
}

/** 채팅 Effect 를 이 수신자에게 보낼지 판단한다. DO 가 팬아웃할 때 쓴다 */
export function shouldDeliver(effect: Effect, receiverTeam: TeamId | null): boolean {
  if (effect.kind !== 'chat') return true
  return canReceive(effect.line.channel, effect.senderTeam, receiverTeam)
}

/** 아직 못 맞힌 사람에게 보여줄 가림 문자 */
export const MASKED_ANSWER = '***'

/**
 * ★ 이 수신자가 실제로 받을 채팅 줄.
 *
 * 정답 줄은 **이미 맞힌 사람에게만** 원문이 간다. 나머지는 `***` 를 본다 —
 * 「맞혔다」는 사실만 공유되고 답 자체는 공유되지 않는다.
 * 이 함수를 거치지 않고 effect.line 을 그대로 보내면 정답이 새어 나간다.
 */
export function lineFor(
  effect: Extract<Effect, { kind: 'chat' }>,
  viewer: PlayerId,
): ChatLine {
  if (effect.revealTo === null || effect.revealTo.includes(viewer)) return effect.line
  return { ...effect.line, text: MASKED_ANSWER }
}
