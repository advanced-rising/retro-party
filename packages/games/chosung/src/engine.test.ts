import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asPlayerId,
  asRoomId,
  asSeed,
  type Participant,
  type RoomCode,
  type RoomState,
} from '@retro/types'
import {
  createEngine,
  COUNTDOWN_MS,
  type ContentPool,
  type Effect,
  type Engine,
} from '@retro/room-kit'
import { chosungGame, ROUND_MS, type ChosungQuestion, type ChosungView } from './index.ts'

/**
 * 초성 퀴즈를 방 엔진에 실제로 꽂아 본다.
 * 엔진 단위 테스트는 가짜 게임을 쓰므로, 진짜 게임과의 접합은 여기서 본다.
 */

const POOL: ContentPool = { version: 'sample', items: [] }
const P = asPlayerId

function player(id: string): Participant {
  return {
    playerId: P(id),
    nickname: id,
    avatarIcon: 'floppy-disk',
    level: 1,
    titleName: null,
    team: null,
    connected: true,
    benched: false,
  }
}

function makeEngine(names: readonly string[] = ['a', 'b']): Engine<ChosungQuestion, ChosungView> {
  const room: RoomState = {
    roomId: asRoomId('room-chosung'),
    code: 'RETRO2' as RoomCode,
    seed: asSeed('seed-chosung'),
    hostId: P(names[0] ?? 'a'),
    settings: { gameId: chosungGame.id, mode: 'casual', rounds: 2, teamSize: null, isPublic: true },
    phase: { kind: 'lobby' },
    participants: [],
    scores: new Map(),
  }
  const engine = createEngine({ game: chosungGame, room, pool: POOL })
  for (const n of names) engine.join({ participant: player(n), nowMs: 0 })
  return engine
}

function answerOf(engine: Engine<ChosungQuestion, ChosungView>): string {
  const q = engine.state.question
  assert.ok(q !== null, '문제가 없다')
  return chosungGame.reveal(q).answer
}

test('초성 퀴즈를 방에서 한 판 돌린다', () => {
  const engine = makeEngine(['a', 'b'])
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)
  assert.equal(engine.state.room.phase.kind, 'playing')

  const view = engine.viewFor(P('a'), COUNTDOWN_MS)
  assert.ok(view !== null)
  assert.ok(view.chosung.length > 0, '초성이 보여야 한다')
  assert.equal(view.hint, null, '시작 직후에는 힌트가 없다')

  const answer = answerOf(engine)
  engine.chat({ playerId: P('a'), text: answer, channel: 'all', nowMs: COUNTDOWN_MS + 1_000 })
  assert.ok((engine.state.room.scores.get(P('a')) ?? 0) > 0)

  engine.chat({ playerId: P('b'), text: answer, channel: 'all', nowMs: COUNTDOWN_MS + 3_000 })
  assert.equal(engine.state.room.phase.kind, 'reveal', '둘 다 맞히면 라운드가 끝난다')
})

test('엔진이 뿌리는 board 에 정답이 없다', () => {
  const engine = makeEngine(['a', 'b'])
  engine.start(P('a'), 0)
  const collected: Effect[] = [...engine.tick(COUNTDOWN_MS)]
  const answer = answerOf(engine)

  // 힌트가 전부 열리는 시점까지 밀어 본다
  for (let t = 1_000; t < ROUND_MS; t += 1_000) {
    collected.push(...engine.boardsAt(COUNTDOWN_MS + t))
  }

  assert.ok(!JSON.stringify(collected).includes(answer), `정답 "${answer}" 이 board 에 실렸다`)
})

test('힌트는 시간이 지나야 board 에 붙는다', () => {
  const engine = makeEngine(['a', 'b'])
  engine.start(P('a'), 0)
  engine.tick(COUNTDOWN_MS)

  assert.equal(engine.viewFor(P('a'), COUNTDOWN_MS + 7_000)?.hint, null)
  assert.ok(engine.viewFor(P('a'), COUNTDOWN_MS + 9_000)?.hint !== null, '8초 뒤에는 힌트가 열린다')
  assert.ok(
    engine.viewFor(P('a'), COUNTDOWN_MS + 15_000)?.firstVowel !== null,
    '14초 뒤에는 모음이 열린다',
  )
})
