import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyProgress, readProgress, readManyProgress, recordMatch, type Sql } from './index.ts'

/**
 * DB 가 없어도 게임이 돌아야 한다.
 *
 * 로컬 개발과 초기 배포에는 Hyperdrive 바인딩이 없다. 그때 조용히 넘어가지
 * 않고 던지면 방에 들어가지도 못한다 — 기록보다 판이 우선이다.
 */

test('DB 가 없으면 빈 진행 상황을 돌려준다', async () => {
  const progress = await readProgress(null, 'device-1')
  assert.deepEqual(progress, emptyProgress('device-1'))
  assert.equal(progress.level, 1)
})

test('DB 가 없어도 여러 명을 읽을 수 있다', async () => {
  const many = await readManyProgress(null, ['a', 'b'])
  assert.equal(many.size, 2)
  assert.equal(many.get('a')?.level, 1)
})

test('DB 가 없으면 기록은 조용히 넘어간다', async () => {
  await recordMatch(null, {
    id: 'm1',
    roomCode: 'ABCDEF',
    gameId: 'chosung',
    mode: 'casual',
    teamSize: null,
    rounds: 5,
    topics: [],
    startedAt: new Date(0),
    players: [
      {
        deviceId: 'd1',
        nickname: '나',
        team: null,
        score: 100,
        rank: 0,
        correctCount: 2,
        wrongCount: 1,
        firstAnswerMs: 1200,
        xpGained: 100,
      },
    ],
  })
})

test('★ 읽기가 실패해도 던지지 않는다', async () => {
  const broken: Sql = (() => {
    throw new Error('연결 끊김')
  }) as unknown as Sql

  const progress = await readProgress(broken, 'device-1')
  assert.equal(progress.level, 1, 'DB 가 죽어도 방에는 들어갈 수 있어야 한다')
})

test('★ 저장된 level 을 믿지 않고 xp 로 다시 뽑는다', async () => {
  // 곡선이 바뀌면 저장된 level 이 낡는다. 그때 틀린 레벨이 조용히 보이면 안 된다
  const stale: Sql = (async () => [
    { xp: '3000', level: 99, matches: 1, wins: 0, total_score: '100' },
  ]) as unknown as Sql

  const progress = await readProgress(stale, 'device-1')
  assert.equal(progress.xp, 3000)
  assert.equal(progress.level, 10, '3000 XP 는 10레벨이다 (10 문서 §1.3)')
  assert.notEqual(progress.level, 99, '저장된 값을 그대로 쓰면 안 된다')
})

test('빈 명단은 기록하지 않는다', async () => {
  let called = false
  const spy: Sql = (async () => {
    called = true
    return []
  }) as unknown as Sql

  await recordMatch(spy, {
    id: 'm2',
    roomCode: 'ABCDEF',
    gameId: 'chosung',
    mode: 'casual',
    teamSize: null,
    rounds: 5,
    topics: [],
    startedAt: new Date(0),
    players: [],
  })
  assert.equal(called, false, '아무도 없는 판은 남길 게 없다')
})
