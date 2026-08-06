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

export const COUNTDOWN_MS = 3_000
export const REVEAL_MS = 4_000
/** 출제자가 이만큼 조용하면 라운드를 넘긴다 — 02 문서 §3.8 */
export const PRESENTER_IDLE_MS = 20_000

export type Effect =
  | { readonly kind: 'broadcast'; readonly message: ServerMessage }
  | { readonly kind: 'send'; readonly to: PlayerId; readonly message: ServerMessage }
  /** 채팅은 수신자별로 걸러야 한다. senderTeam 을 들려 보낸다 — 01 문서 §6.5.2 */
  | { readonly kind: 'chat'; readonly line: ChatLine; readonly senderTeam: TeamId | null }
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
    effects.unshift({ kind: 'chat', line, senderTeam: teamOf(playerId) })

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
