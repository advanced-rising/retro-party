import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import {
  errorRatio,
  mulgaGame,
  parsePrice,
  EXACT_BAND,
  NEAR_BAND,
  ROUND_MS,
  type MulgaQuestion,
} from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

function makeQuestion(seed = 'seed-1', roundNo = 0): MulgaQuestion {
  return mulgaGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    presenter: null,
  })
}

const freshRound = (expectedSolvers = 4) =>
  emptyRound({ roundNo: 0, startedAtMs: 0, roundMs: ROUND_MS, expectedSolvers, presenter: null })

// ── ★ 정답 누출 ─────────────────────────────────────

test('viewFor 가 가격을 흘리지 않는다', () => {
  for (let i = 0; i < 40; i++) {
    const question = makeQuestion('leak', i)
    const view = mulgaGame.viewFor({
      question,
      round: freshRound(),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    const serialized = JSON.stringify(view)
    assert.ok(
      !serialized.includes(String(question.price)),
      `가격 ${question.price} 이 뷰에 노출됨: ${serialized}`,
    )
  }
})

test('자릿수 힌트는 20초 뒤에 열린다', () => {
  const question: MulgaQuestion = {
    item: '자장면 한 그릇',
    year: 1997,
    price: 2500,
    unit: '원',
    note: '전국 평균',
  }
  const at = (nowMs: number) =>
    mulgaGame.viewFor({ question, round: freshRound(), playerId: P1, team: null, nowMs })

  assert.equal(at(0).digits, null)
  assert.equal(at(19_000).digits, null)
  assert.equal(at(20_000).digits, 4, '2500 은 네 자리')
})

// ── 금액 파싱 ───────────────────────────────────────

test('여러 표기의 금액을 받는다', () => {
  assert.equal(parsePrice('2500'), 2500)
  assert.equal(parsePrice('2,500'), 2500)
  assert.equal(parsePrice('2500원'), 2500)
  assert.equal(parsePrice(' 2,500원 '), 2500)
  assert.equal(parsePrice('130'), 130)
})

test('금액이 아니면 null', () => {
  assert.equal(parsePrice('비싸다'), null)
  assert.equal(parsePrice(''), null)
  assert.equal(parsePrice('0'), null, '0원짜리 문제는 없다')
  assert.equal(parsePrice('2천5백'), null)
  assert.equal(parsePrice('1234567890'), null, '10자리는 오타로 본다')
})

test('오차율 계산', () => {
  assert.equal(errorRatio(2500, 2500), 0)
  assert.equal(errorRatio(2600, 2500), 0.04)
  assert.equal(errorRatio(2400, 2500), 0.04)
  assert.equal(errorRatio(5000, 2500), 1)
})

// ── ★ 판정과 방향 힌트 ──────────────────────────────

const question2500: MulgaQuestion = {
  item: '자장면 한 그릇',
  year: 1997,
  price: 2500,
  unit: '원',
  note: '전국 평균',
}

const judge = (text: string, round = freshRound(), playerId = P1, atMs = 1_000) =>
  mulgaGame.judge({ question: question2500, round, playerId, text, atMs })

test('오차 5% 이내는 정답', () => {
  assert.equal(judge('2500').kind, 'correct', '정확히 맞힘')
  assert.equal(judge('2600').kind, 'correct', '4% 차이')
  assert.equal(judge('2400').kind, 'correct')
  assert.equal(judge(String(Math.round(2500 * (1 + EXACT_BAND)))).kind, 'correct', '경계값')
})

test('오차 20% 이내는 부분 점수, 한 번만', () => {
  const near = judge('2900')
  assert.equal(near.kind, 'partial', '16% 차이면 아깝다')
  if (near.kind === 'partial') {
    assert.equal(near.points, 30)
    assert.ok(near.note?.includes('더 싸요'), `방향을 알려줘야 한다: ${near.note}`)
  }

  const used = { ...freshRound(), partials: [P1] }
  assert.equal(judge('2900', used).kind, 'wrong', '두 번째 근접은 오답')
  assert.equal(judge('2900', used, P2).kind, 'partial', '다른 사람은 아직 받을 수 있다')
  assert.ok(NEAR_BAND > EXACT_BAND)
})

test('★ 틀려도 방향을 알려준다 — 이게 없으면 채팅이 죽는다', () => {
  const tooLow = judge('500')
  assert.equal(tooLow.kind, 'wrong')
  if (tooLow.kind === 'wrong') assert.equal(tooLow.note, '더 비싸요')

  const tooHigh = judge('10000')
  assert.equal(tooHigh.kind, 'wrong')
  if (tooHigh.kind === 'wrong') assert.equal(tooHigh.note, '더 싸요')
})

test('★ 방향 힌트에 정답을 유추할 값이 없다', () => {
  for (const guess of ['1', '100', '500', '9999', '100000']) {
    const result = judge(guess)
    const note = result.kind === 'wrong' || result.kind === 'partial' ? (result.note ?? '') : ''
    assert.ok(!note.includes('2500'), `힌트가 정답을 흘렸다: ${note}`)
    assert.ok(!/\d/.test(note), `힌트에 숫자가 있으면 안 된다: ${note}`)
  }
})

test('숫자가 아니면 판정하지 않는다', () => {
  assert.equal(judge('와 그때 진짜 쌌네').kind, 'ignored')
  assert.equal(judge('ㅋㅋㅋ').kind, 'ignored')
})

test('이미 맞힌 사람은 다시 판정하지 않는다', () => {
  assert.equal(judge('2500', { ...freshRound(), solved: [P1] }).kind, 'ignored')
})

// ── 점수 ────────────────────────────────────────────

test('빠를수록 점수가 높다 — 초 단위로 깎인다', () => {
  const at = (atMs: number) => judge('2500', freshRound(), P1, atMs)
  const first = at(500)
  const mid = at(10_000)
  const last = at(35_000)

  assert.equal(first.kind, 'correct')
  assert.equal(mid.kind, 'correct')
  assert.equal(last.kind, 'correct')
  if (first.kind === 'correct' && mid.kind === 'correct' && last.kind === 'correct') {
    assert.ok(first.points > mid.points, `0.5초 ${first.points} > 10초 ${mid.points}`)
    assert.ok(mid.points > last.points, `10초 ${mid.points} > 35초 ${last.points}`)
  }
})

// ── 공개 ────────────────────────────────────────────

test('공개할 때 금액을 읽기 좋게 보여준다', () => {
  const revealed = mulgaGame.reveal(question2500)
  assert.equal(revealed.answer, '2,500원')
})

test('같은 시드는 같은 문제를 만든다', () => {
  assert.deepEqual(makeQuestion('daily', 4), makeQuestion('daily', 4))
})

test('전원이 맞히면 라운드가 끝난다', () => {
  const round = { ...freshRound(2), solved: [P1] }
  assert.equal(mulgaGame.isRoundOver(question2500, round), false)
  assert.equal(mulgaGame.isRoundOver(question2500, { ...round, solved: [P1, P2] }), true)
})

// ── 데이터 위생 ─────────────────────────────────────

test('모든 문항에 검증 근거가 붙어 있다', async () => {
  const { SAMPLE_PRICES } = await import('./data.ts')
  for (const entry of SAMPLE_PRICES) {
    assert.ok(entry.source.length > 0, `${entry.item} ${entry.year} 에 근거가 없다`)
    assert.ok(entry.price > 0)
    assert.ok(entry.year >= 1980 && entry.year <= 2025, `${entry.year} 는 범위 밖`)
    // "성인 1구간" 같은 작은 수는 괜찮다. 막아야 하는 건 가격처럼 보이는 수다
    assert.ok(
      !entry.note.includes(String(entry.price)),
      `단서에 정답이 그대로 있다: ${entry.note}`,
    )
    assert.ok(
      !/\d{3,}/.test(entry.note),
      `단서에 세 자리 이상 숫자가 있으면 정답으로 읽힌다: ${entry.note}`,
    )
  }
})
