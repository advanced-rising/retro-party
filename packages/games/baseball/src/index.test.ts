import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import {
  baseballGame,
  judgeGuess,
  parseGuess,
  verdictText,
  DIGITS,
  ROUND_MS,
  type BaseballQuestion,
} from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'none', items: [] }
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

const makeQuestion = (seed = 'seed-1', roundNo = 0): BaseballQuestion =>
  baseballGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    topics: [],
    presenter: null,
  })

const freshRound = (expectedSolvers = 4) =>
  emptyRound({ roundNo: 0, startedAtMs: 0, roundMs: ROUND_MS, expectedSolvers, presenter: null })

// ── ★ 정답 누출 ─────────────────────────────────────

test('viewFor 가 정답을 흘리지 않는다', () => {
  for (let i = 0; i < 40; i++) {
    const question = makeQuestion('leak', i)
    const view = baseballGame.viewFor({
      question,
      round: freshRound(),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    assert.ok(
      !JSON.stringify(view).includes(question.secret),
      `정답 ${question.secret} 이 노출됐다`,
    )
  }
})

// ── 문제 생성 ───────────────────────────────────────

test('★ 자릿수가 서로 다르고 앞자리가 0 이 아니다', () => {
  for (let i = 0; i < 200; i++) {
    const { secret } = makeQuestion('gen', i)
    assert.equal(secret.length, DIGITS)
    assert.equal(new Set(secret).size, DIGITS, `${secret} 에 같은 숫자가 있다`)
    assert.notEqual(secret[0], '0', `${secret} 은 앞자리가 0 이다`)
  }
})

test('같은 시드는 같은 숫자를 만든다', () => {
  assert.deepEqual(makeQuestion('daily', 3), makeQuestion('daily', 3))
})

// ── 판정 ────────────────────────────────────────────

test('스트라이크와 볼을 센다', () => {
  assert.deepEqual(judgeGuess('123', '123'), { strikes: 3, balls: 0 })
  assert.deepEqual(judgeGuess('132', '123'), { strikes: 1, balls: 2 })
  assert.deepEqual(judgeGuess('231', '123'), { strikes: 0, balls: 3 })
  assert.deepEqual(judgeGuess('456', '123'), { strikes: 0, balls: 0 })
  assert.deepEqual(judgeGuess('145', '123'), { strikes: 1, balls: 0 })
})

test('판정을 사람 말로 바꾼다', () => {
  assert.equal(verdictText({ strikes: 0, balls: 0 }), '아웃')
  assert.equal(verdictText({ strikes: 2, balls: 1 }), '2스트라이크 1볼')
  assert.equal(verdictText({ strikes: 0, balls: 2 }), '2볼')
})

test('입력 표기를 여러 형태로 받는다', () => {
  assert.equal(parseGuess('123', 3), '123')
  assert.equal(parseGuess('1 2 3', 3), '123')
  assert.equal(parseGuess(' 4-5-6 ', 3), '456')
})

test('자리가 겹치거나 길이가 다르면 안 받는다', () => {
  assert.equal(parseGuess('112', 3), null, '같은 숫자가 겹치면 판정이 성립하지 않는다')
  assert.equal(parseGuess('12', 3), null)
  assert.equal(parseGuess('1234', 3), null)
  assert.equal(parseGuess('아무말', 3), null)
})

// ── ★ 되먹임이 게임의 전부다 ─────────────────────────

const fixture: BaseballQuestion = { secret: '123' }
const judge = (text: string, round = freshRound(), playerId = P1) =>
  baseballGame.judge({ question: fixture, round, playerId, text, atMs: 2_000 })

test('★ 틀려도 판정을 돌려준다', () => {
  const miss = judge('132')
  assert.equal(miss.kind, 'wrong')
  if (miss.kind === 'wrong') assert.equal(miss.note, '1스트라이크 2볼')

  const out = judge('456')
  if (out.kind === 'wrong') assert.equal(out.note, '아웃')
})

test('★ 판정에 정답이 섞이지 않는다', () => {
  for (const guess of ['456', '132', '789', '102']) {
    const result = judge(guess)
    const note = result.kind === 'wrong' ? (result.note ?? '') : ''
    assert.ok(!note.includes(fixture.secret), `힌트가 정답을 흘렸다: ${note}`)
  }
})

test('세 자리를 다 맞히면 정답', () => {
  assert.equal(judge('123').kind, 'correct')
})

test('초반 시도는 벌점이 없다 — 틀리면서 좁히는 게 정상이다', () => {
  const early = judge('456')
  assert.equal(early.kind, 'wrong')
  if (early.kind === 'wrong') assert.equal(early.penalty ?? 0, 0)
})

test('숫자가 아니면 판정하지 않는다', () => {
  assert.equal(judge('아 모르겠다').kind, 'ignored')
  assert.equal(judge('ㅋㅋ').kind, 'ignored')
})

test('전원이 맞히면 라운드가 끝난다', () => {
  const round = { ...freshRound(2), solved: [P1] }
  assert.equal(baseballGame.isRoundOver(fixture, round), false)
  assert.equal(baseballGame.isRoundOver(fixture, { ...round, solved: [P1, P2] }), true)
})
