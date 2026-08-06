import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asGameId,
  asPlayerId,
  asRoomId,
  asSeed,
  type Participant,
  type RoomCode,
  type RoomMode,
  type RoomState,
  type TeamId,
} from '@retro/types'
import {
  createEngine,
  lineFor,
  shouldDeliver,
  COUNTDOWN_MS,
  MASKED_ANSWER,
  REVEAL_MS,
  type Effect,
} from './engine.ts'
import type { ContentPool, RoomGame, RoundState } from './game.ts'
import { roundScore } from './scoring.ts'

/**
 * 엔진 테스트는 특정 게임에 의존하지 않는다.
 * 정답이 무엇인지 아는 최소 게임 모듈을 세워 두고 방 로직만 본다.
 */

const ANSWER = '삐삐'
const ROUND_MS = 20_000

interface FakeQuestion {
  readonly answer: string
}
interface FakeView {
  readonly length: number
  readonly solvedCount: number
}

const fakeGame: RoomGame<FakeQuestion, FakeView> = {
  id: asGameId('fake'),
  meta: { name: '테스트', minPlayers: 2, maxPlayers: 8, roundMs: ROUND_MS, hasPresenter: false },
  createRound: () => ({ answer: ANSWER }),
  judge(input) {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }
    if (input.text.trim() !== input.question.answer) return { kind: 'wrong' }
    const rank = input.round.solved.length
    return {
      kind: 'correct',
      rank,
      points: roundScore({ rank, elapsedMs: input.atMs - input.round.startedAtMs, roundMs: ROUND_MS }),
    }
  },
  isRoundOver: (_q, round: RoundState) =>
    round.solved.length > 0 && round.solved.length >= round.expectedSolvers,
  reveal: (q) => ({ answer: q.answer, detail: null }),
  viewFor: (input) => ({ length: input.question.answer.length, solvedCount: input.round.solved.length }),
}

const POOL: ContentPool = { version: 'test', items: [] }

function player(id: string): Participant {
  return {
    playerId: asPlayerId(id),
    nickname: id,
    avatarIcon: 'cassette-tape',
    level: 1,
    titleName: null,
    team: null,
    connected: true,
    benched: false,
  }
}

function makeRoom(hostId: string, mode: RoomMode, rounds: number): RoomState {
  return {
    roomId: asRoomId('room-1'),
    code: 'ABCDEF' as RoomCode,
    seed: asSeed('seed-room-1'),
    hostId: asPlayerId(hostId),
    settings: { gameId: fakeGame.id, mode, rounds, teamSize: null, isPublic: true, title: '테스트 방', topics: [] },
    phase: { kind: 'lobby' },
    participants: [],
    scores: new Map(),
    locked: false,
  }
}

function makeEngine(mode: RoomMode = 'casual', names: readonly string[] = ['a', 'b'], rounds = 2) {
  const engine = createEngine({
    game: fakeGame,
    room: makeRoom(names[0] ?? 'a', mode, rounds),
    pool: POOL,
  })
  for (const n of names) engine.join({ participant: player(n), nowMs: 0 })
  return engine
}

const P = asPlayerId
const chatEffects = (effects: readonly Effect[]) => effects.filter((e) => e.kind === 'chat')
const errorCodes = (effects: readonly Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === 'send' && e.message.type === 'error' ? [e.message.code] : []))
const phaseKind = (engine: ReturnType<typeof makeEngine>): string => engine.state.room.phase.kind

// ── ★ 정답 누출 ─────────────────────────────────────

test('진행 중 어떤 Effect 에도 정답이 실리지 않는다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'])
  const collected: Effect[] = [...engine.start(P('a'), 0)]
  collected.push(...engine.tick(COUNTDOWN_MS))
  collected.push(...engine.tick(COUNTDOWN_MS + 1_000))
  collected.push(...engine.tick(COUNTDOWN_MS + 9_000))

  assert.ok(!JSON.stringify(collected).includes(ANSWER), `정답 "${ANSWER}" 이 Effect 에 노출됐다`)
})

// ── ★ 팀 채널 격리 ──────────────────────────────────

test('팀 채널은 같은 팀에게만 간다', () => {
  const line = { from: P('a'), text: ANSWER, channel: 'team' as const, correct: null, note: null }
  const effect: Effect = { kind: 'chat', line, senderTeam: 0, revealTo: null }

  assert.equal(shouldDeliver(effect, 0), true, '같은 팀은 받는다')
  assert.equal(shouldDeliver(effect, 1), false, '상대 팀은 받으면 안 된다')

  const allChannel: Effect = {
    kind: 'chat',
    line: { ...line, channel: 'all' },
    senderTeam: 0,
    revealTo: null,
  }
  assert.equal(shouldDeliver(allChannel, 1), true, '전체 채널은 모두 받는다')
})

test('팀전에서 전체 채널에 답을 쳐도 점수가 들어가지 않는다', () => {
  const engine = makeEngine('team', ['a', 'b', 'c', 'd'])
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)
  const nowMs = COUNTDOWN_MS + 1_000

  const loud = engine.chat({ playerId: P('a'), text: ANSWER, channel: 'all', nowMs })
  assert.equal(engine.state.room.scores.get(P('a')), 0, '전체 채널 정답은 0점')
  assert.equal(chatEffects(loud).length, 1, '그래도 채팅으로는 흐른다')

  engine.chat({ playerId: P('b'), text: ANSWER, channel: 'team', nowMs: nowMs + 2_000 })
  assert.ok((engine.state.room.scores.get(P('b')) ?? 0) > 0, '팀 채널 정답은 점수가 들어간다')
})

// ── ★ 정답 원문 가리기 ──────────────────────────────

test('먼저 맞힌 사람의 답이 나머지에게 그대로 보이면 안 된다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'], 2)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  const effects = engine.chat({
    playerId: P('a'),
    text: ANSWER,
    channel: 'all',
    nowMs: COUNTDOWN_MS + 500,
  })
  const chat = effects.find((e) => e.kind === 'chat')
  assert.ok(chat !== undefined && chat.kind === 'chat')
  if (chat === undefined || chat.kind !== 'chat') return

  // 맞힌 본인은 자기가 뭘 쳤는지 본다
  assert.equal(lineFor(chat, P('a')).text, ANSWER, '본인은 원문을 본다')

  // 아직 못 맞힌 사람에게는 가려진다 — 안 그러면 그대로 베낀다
  assert.equal(lineFor(chat, P('b')).text, MASKED_ANSWER, '★ 아직 못 맞힌 사람은 못 본다')
  assert.equal(lineFor(chat, P('c')).text, MASKED_ANSWER)

  // 「맞혔다」는 사실 자체는 공유된다
  assert.ok(lineFor(chat, P('b')).correct !== null, '맞혔다는 것은 보여야 한다')
})

test('이미 맞힌 사람끼리는 서로의 답을 본다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'], 2)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)
  engine.chat({ playerId: P('a'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 500 })

  const second = engine.chat({
    playerId: P('b'),
    text: ANSWER,
    channel: 'all',
    nowMs: COUNTDOWN_MS + 2_000,
  })
  const chat = second.find((e) => e.kind === 'chat')
  if (chat === undefined || chat.kind !== 'chat') throw new Error('chat effect 가 없다')

  assert.equal(lineFor(chat, P('a')).text, ANSWER, '먼저 맞힌 사람은 볼 수 있다')
  assert.equal(lineFor(chat, P('c')).text, MASKED_ANSWER, '아직 못 맞힌 사람은 못 본다')
})

test('오답과 잡담은 가리지 않는다', () => {
  const engine = makeEngine('casual', ['a', 'b'], 2)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  const effects = engine.chat({
    playerId: P('a'),
    text: '아 이게 뭐였지',
    channel: 'all',
    nowMs: COUNTDOWN_MS + 500,
  })
  const chat = effects.find((e) => e.kind === 'chat')
  if (chat === undefined || chat.kind !== 'chat') throw new Error('chat effect 가 없다')
  assert.equal(chat.revealTo, null, '정답이 아니면 전원이 원문을 본다')
  assert.equal(lineFor(chat, P('b')).text, '아 이게 뭐였지')
})

// ── 팀 편성 ─────────────────────────────────────────

test('5명 팀전은 2대2 + 1명 벤치', () => {
  const engine = makeEngine('team', ['a', 'b', 'c', 'd', 'e'])
  engine.start(P('a'), 0)

  const ps = engine.state.room.participants
  assert.equal(ps.filter((p) => p.benched).length, 1, '한 명이 쉰다')
  assert.equal(engine.state.room.settings.teamSize, 2)

  const counts = new Map<TeamId, number>()
  for (const p of ps) {
    if (p.team !== null) counts.set(p.team, (counts.get(p.team) ?? 0) + 1)
  }
  assert.equal(counts.get(0), 2)
  assert.equal(counts.get(1), 2)
})

test('이번 판을 쉰 사람은 다음 판에 반드시 들어간다', () => {
  const engine = makeEngine('team', ['a', 'b', 'c', 'd', 'e'], 1)
  engine.start(P('a'), 0)
  const benched = engine.state.room.participants.find((p) => p.benched)
  assert.ok(benched !== undefined)

  engine.tick(COUNTDOWN_MS)
  engine.tick(COUNTDOWN_MS + ROUND_MS)
  engine.tick(COUNTDOWN_MS + ROUND_MS + REVEAL_MS)
  assert.equal(phaseKind(engine), 'result')

  engine.again(P('a'), 100_000)
  const again = engine.state.room.participants.find((p) => p.playerId === benched.playerId)
  assert.equal(again?.benched, false, '연속으로 쉬게 하면 안 된다')
})

test('4명이 안 되면 팀전은 개인전으로 떨어진다', () => {
  const engine = makeEngine('team', ['a', 'b', 'c'])
  engine.start(P('a'), 0)
  assert.equal(engine.state.room.settings.mode, 'casual')
  assert.ok(engine.state.room.participants.every((p) => p.team === null))
})

// ── 시작 조건 ───────────────────────────────────────

test('혼자서는 시작할 수 없다', () => {
  const engine = makeEngine('casual', ['a'])
  assert.deepEqual(errorCodes(engine.start(P('a'), 0)), ['not_enough_players'])
  assert.equal(phaseKind(engine), 'lobby')
})

test('방장이 아니면 시작할 수 없다', () => {
  const engine = makeEngine('casual', ['a', 'b'])
  assert.deepEqual(errorCodes(engine.start(P('b'), 0)), ['not_host'])
})

// ── 진행 ────────────────────────────────────────────

test('로비 → 카운트다운 → 플레이 → 공개 → 결과', () => {
  const engine = makeEngine('casual', ['a', 'b'], 2)
  engine.start(P('a'), 0)
  assert.equal(phaseKind(engine), 'countdown')

  engine.tick(COUNTDOWN_MS)
  assert.equal(phaseKind(engine), 'playing')

  let t = COUNTDOWN_MS + ROUND_MS
  engine.tick(t)
  assert.equal(phaseKind(engine), 'reveal')

  t += REVEAL_MS
  engine.tick(t)
  assert.equal(phaseKind(engine), 'playing', '2라운드가 이어진다')

  t += ROUND_MS
  engine.tick(t)
  t += REVEAL_MS
  const done = engine.tick(t)
  assert.equal(phaseKind(engine), 'result')
  assert.ok(done.some((e) => e.kind === 'matchOver'))
})

test('공개 단계에서만 정답이 나간다', () => {
  const engine = makeEngine('casual', ['a', 'b'], 1)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)
  const revealEffects = engine.tick(COUNTDOWN_MS + ROUND_MS)
  assert.ok(JSON.stringify(revealEffects).includes(ANSWER), '공개 때는 정답을 알려줘야 한다')
})

test('전원이 맞히면 라운드가 즉시 끝난다', () => {
  const engine = makeEngine('casual', ['a', 'b'], 2)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  engine.chat({ playerId: P('a'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 500 })
  assert.equal(phaseKind(engine), 'playing', '한 명 맞혀서는 안 끝난다')

  engine.chat({ playerId: P('b'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 2_000 })
  assert.equal(phaseKind(engine), 'reveal', '전원 정답이면 바로 공개')
})

test('먼저 맞힌 사람이 더 받는다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'], 1)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)
  engine.chat({ playerId: P('a'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 300 })
  engine.chat({ playerId: P('b'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 4_000 })

  const first = engine.state.room.scores.get(P('a')) ?? 0
  const second = engine.state.room.scores.get(P('b')) ?? 0
  assert.ok(first > second, `1등 ${first} 이 2등 ${second} 보다 커야 한다`)
})

// ── 재접속 ──────────────────────────────────────────

test('진행 중 나갔다 들어오면 점수를 이어받는다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'], 3)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  engine.chat({ playerId: P('b'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 500 })
  const earned = engine.state.room.scores.get(P('b')) ?? 0
  assert.ok(earned > 0)

  engine.leave(P('b'), COUNTDOWN_MS + 1_000)
  assert.equal(
    engine.state.room.participants.find((p) => p.playerId === P('b'))?.connected,
    false,
    '진행 중에는 자리를 지운다',
  )

  engine.join({ participant: player('b'), nowMs: COUNTDOWN_MS + 5_000 })
  assert.equal(engine.state.room.scores.get(P('b')), earned, '점수가 유지돼야 한다')
  assert.equal(engine.state.room.participants.find((p) => p.playerId === P('b'))?.connected, true)
})

test('방장이 나가면 방장이 넘어간다', () => {
  const engine = makeEngine('casual', ['a', 'b'])
  engine.leave(P('a'), 0)
  assert.equal(engine.state.room.hostId, P('b'))
})

test('로비에서 나가면 자리가 사라진다', () => {
  const engine = makeEngine('casual', ['a', 'b'])
  engine.leave(P('b'), 0)
  assert.equal(engine.state.room.participants.length, 1)
})

test('남은 사람이 다 맞히면 나간 사람을 기다리지 않는다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c'], 2)
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  engine.chat({ playerId: P('a'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 500 })
  engine.chat({ playerId: P('b'), text: ANSWER, channel: 'all', nowMs: COUNTDOWN_MS + 2_000 })
  assert.equal(phaseKind(engine), 'playing', 'c 가 아직 남았다')

  engine.leave(P('c'), COUNTDOWN_MS + 3_000)
  assert.equal(phaseKind(engine), 'reveal', 'c 가 나갔으면 기다릴 이유가 없다')
})

// ── 정원 ────────────────────────────────────────────

test('9번째 사람은 들어올 수 없다', () => {
  const engine = makeEngine('casual', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  assert.deepEqual(errorCodes(engine.join({ participant: player('i'), nowMs: 0 })), ['room_full'])
  assert.equal(engine.state.room.participants.length, 8)
})

// ── 도배 ────────────────────────────────────────────

test('연속 입력은 막힌다', () => {
  const engine = makeEngine('casual', ['a', 'b'])
  const send = (nowMs: number) =>
    engine.chat({ playerId: P('a'), text: '아무말', channel: 'all', nowMs })

  send(0)
  send(10)
  send(20)
  assert.deepEqual(errorCodes(send(30)), ['rate_limited'])
})
