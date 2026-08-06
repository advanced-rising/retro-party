import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asPlayerId,
  asRoomId,
  asSeed,
  type Participant,
  type RoomCode,
  type RoomMode,
  type RoomState,
} from '@retro/types'
import { createEngine, type ContentPool, type Effect } from '@retro/room-kit'
import { sketchGame } from './index.ts'

/**
 * 스케치는 그리는 사람과 맞히는 사람이 갈려야 성립한다.
 * 혼자서는 아무도 그리지 않는 빈 캔버스만 남는다.
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

function makeEngine(mode: RoomMode, names: readonly string[]) {
  const room: RoomState = {
    roomId: asRoomId('room-sketch'),
    code: 'SKETCH' as RoomCode,
    seed: asSeed('seed-sketch'),
    hostId: P(names[0] ?? 'a'),
    settings: {
      gameId: sketchGame.id,
      mode,
      rounds: 2,
      teamSize: null,
      isPublic: true,
      title: '스케치 테스트',
      topics: [],
    },
    phase: { kind: 'lobby' },
    participants: [],
    scores: new Map(),
    locked: false,
  }
  const engine = createEngine({ game: sketchGame, room, pool: POOL })
  for (const n of names) engine.join({ participant: player(n), nowMs: 0 })
  return engine
}

const errorCodes = (effects: readonly Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === 'send' && e.message.type === 'error' ? [e.message.code] : []))

test('★ 혼자 모드여도 스케치는 2명이 필요하다', () => {
  const solo = makeEngine('solo', ['a'])
  assert.deepEqual(
    errorCodes(solo.start(P('a'), 0)),
    ['not_enough_players'],
    '혼자면 아무도 그리지 않는 빈 캔버스만 남는다',
  )
  assert.equal(solo.state.room.phase.kind, 'lobby')
})

test('두 명이면 시작된다', () => {
  const pair = makeEngine('casual', ['a', 'b'])
  pair.start(P('a'), 0)
  assert.equal(pair.state.room.phase.kind, 'countdown')
})

test('혼자 모드에서도 출제자가 지정된다', () => {
  // 다른 게임과 달리 스케치는 solo 라도 사람이 그려야 한다
  const solo = makeEngine('solo', ['a', 'b'])
  solo.start(P('a'), 0)
  solo.tick(3_000)
  const drawer = solo.state.round?.presenter
  assert.ok(drawer !== null && drawer !== undefined, '그릴 사람이 있어야 한다')
})
