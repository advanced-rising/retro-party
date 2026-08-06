import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import { isRelayDrawerView, relayGame, turnAt, DRAWERS, ROUND_MS, TURN_MS } from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const A = asPlayerId('a')
const B = asPlayerId('b')
const C = asPlayerId('c')
const D = asPlayerId('d')

const makeQuestion = (presenter = A, seed = 'seed-1') =>
  relayGame.createRound({
    seed: asSeed(seed),
    roundNo: 0,
    rng: createRng(asSeed(seed)),
    pool: EMPTY_POOL,
    topics: [],
    presenter,
  })

const roundWith = (presenter: typeof A | null, presenters: readonly (typeof A)[]) => ({
  ...emptyRound({
    roundNo: 0,
    startedAtMs: 0,
    roundMs: ROUND_MS,
    expectedSolvers: 2,
    presenter,
  }),
  presenters,
})

// ── ★ 차례 ──────────────────────────────────────────

test('차례가 시간에 따라 넘어간다', () => {
  assert.equal(turnAt(0, 3), 0)
  assert.equal(turnAt(TURN_MS - 1, 3), 0)
  assert.equal(turnAt(TURN_MS, 3), 1)
  assert.equal(turnAt(TURN_MS * 2, 3), 2)
  assert.equal(turnAt(TURN_MS * 99, 3), 2, '마지막 차례에 머문다')
})

test('★ 후보를 돌아가며 그린다', () => {
  const question = makeQuestion()
  const round = roundWith(A, [A])
  const candidates = [A, B, C, D]

  const at = (nowMs: number) =>
    relayGame.presenterAt?.({ question, round, nowMs, candidates }) ?? null

  const first = at(0)
  const second = at(TURN_MS)
  const third = at(TURN_MS * 2)

  assert.equal(first, A)
  assert.notEqual(second, first, '차례가 넘어가면 다른 사람이 그린다')
  assert.notEqual(third, second)
})

test('사람이 줄어도 그림이 멈추지 않는다', () => {
  const question = makeQuestion()
  const round = roundWith(A, [A])
  // C 와 D 가 나갔다
  const left = relayGame.presenterAt?.({ question, round, nowMs: TURN_MS * 2, candidates: [A, B] })
  assert.ok(left !== null, '남은 사람 중에서 고른다')
  assert.ok([A, B].includes(left as typeof A))
})

// ── ★ 정답 누출 ─────────────────────────────────────

test('그린 사람은 전부 정답을 본다', () => {
  const question = makeQuestion()
  const round = roundWith(C, [A, B, C])

  for (const id of [A, B, C]) {
    const view = relayGame.viewFor({ question, round, playerId: id, team: null, nowMs: TURN_MS * 2 })
    assert.ok(isRelayDrawerView(view), `${id} 는 그린 사람이다`)
    if (isRelayDrawerView(view)) assert.equal(view.word, question.word)
  }
})

test('★ 안 그린 사람에게는 정답이 안 보인다', () => {
  const question = makeQuestion()
  const round = roundWith(C, [A, B, C])
  const view = relayGame.viewFor({ question, round, playerId: D, team: null, nowMs: TURN_MS * 2 })

  assert.equal(view.role, 'guesser')
  assert.ok(!JSON.stringify(view).includes(question.word), '정답이 샜다')
})

test('지금 내 차례인지 알려준다', () => {
  const question = makeQuestion()
  const round = roundWith(B, [A, B])

  const mine = relayGame.viewFor({ question, round, playerId: B, team: null, nowMs: TURN_MS })
  const done = relayGame.viewFor({ question, round, playerId: A, team: null, nowMs: TURN_MS })

  assert.ok(isRelayDrawerView(mine) && mine.myTurn, 'B 차례다')
  assert.ok(isRelayDrawerView(done) && !done.myTurn, 'A 는 이미 그렸다')
})

// ── 판정 ────────────────────────────────────────────

test('그린 사람은 맞혀도 소용없다', () => {
  const question = makeQuestion()
  const round = roundWith(B, [A, B])
  const judge = (playerId: typeof A) =>
    relayGame.judge({ question, round, playerId, text: question.word, atMs: 1_000 })

  assert.equal(judge(A).kind, 'ignored', '이미 답을 봤다')
  assert.equal(judge(B).kind, 'ignored')
  assert.equal(judge(D).kind, 'correct', '안 그린 사람만 맞힐 수 있다')
})

test('그린 사람 전원이 말로 답을 흘리지 못한다', () => {
  const question = makeQuestion()
  const round = roundWith(B, [A, B])
  const banned = (playerId: typeof A) =>
    relayGame.blockedWordsFor?.({ question, round, playerId }) ?? []

  assert.ok(banned(A).length > 0, '먼저 그린 사람도 막혀야 한다')
  assert.ok(banned(B).length > 0)
  assert.deepEqual(banned(D), [], '맞히는 사람은 답을 쳐야 이긴다')
})

test('★ 보너스를 그린 사람들이 나눠 갖는다', () => {
  const question = makeQuestion()
  const round = { ...roundWith(C, [A, B, C]), solved: [D] }
  const bonus = relayGame.roundEndBonus?.(question, round) ?? []

  assert.equal(bonus.length, 3, '세 사람 모두 받는다')
  assert.deepEqual(
    bonus.map(([id]) => id),
    [A, B, C],
  )
  assert.ok((bonus[0]?.[1] ?? 0) > 0)
})

test('아무도 못 맞히면 보너스가 없다', () => {
  const question = makeQuestion()
  const round = roundWith(C, [A, B, C])
  assert.deepEqual(relayGame.roundEndBonus?.(question, round), [])
})

test('세 명은 있어야 성립한다', () => {
  assert.equal(relayGame.meta.minPlayers, 3, '그리는 사람 둘 + 맞히는 사람 하나')
  assert.ok(DRAWERS >= 2, '이어 그리려면 최소 둘이 그려야 한다')
})
