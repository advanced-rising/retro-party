import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import {
  geuhaeGame,
  openHintCount,
  parseYear,
  HINT_INTERVAL_MS,
  MAX_HINTS,
  ROUND_MS,
  type GeuhaeQuestion,
} from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

function makeQuestion(seed = 'seed-1', roundNo = 0): GeuhaeQuestion {
  return geuhaeGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    topics: [],
    presenter: null,
  })
}

const freshRound = (expectedSolvers = 4) =>
  emptyRound({ roundNo: 0, startedAtMs: 0, roundMs: ROUND_MS, expectedSolvers, presenter: null })

// ── ★ 정답 누출 ─────────────────────────────────────

test('viewFor 가 연도를 흘리지 않는다', () => {
  for (let i = 0; i < 40; i++) {
    const question = makeQuestion('leak', i)
    const view = geuhaeGame.viewFor({
      question,
      round: freshRound(),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    const serialized = JSON.stringify(view)
    assert.ok(
      !serialized.includes(String(question.year)),
      `연도 ${question.year} 이 뷰에 노출됨: ${serialized}`,
    )
  }
})

test('아직 안 열린 힌트는 뷰에 담기지 않는다', () => {
  const question = makeQuestion('hints')
  const at = (nowMs: number) =>
    geuhaeGame.viewFor({ question, round: freshRound(), playerId: P1, team: null, nowMs })

  assert.equal(at(0).hints.length, 1, '시작에는 힌트 1개')
  assert.equal(at(HINT_INTERVAL_MS - 1).hints.length, 1)
  assert.equal(at(HINT_INTERVAL_MS).hints.length, 2)
  assert.equal(at(HINT_INTERVAL_MS * 5).hints.length, 6)
  assert.equal(at(ROUND_MS).hints.length, MAX_HINTS, '6개를 넘지 않는다')

  const early = at(0)
  const laterHints = question.hints.slice(1)
  for (const hint of laterHints) {
    assert.ok(!JSON.stringify(early).includes(hint), `안 열린 힌트가 샜다: ${hint}`)
  }
})

test('다음 힌트가 열리는 시각을 절대 시각으로 알려준다', () => {
  const question = makeQuestion('countdown')
  const at = (nowMs: number) =>
    geuhaeGame.viewFor({ question, round: freshRound(), playerId: P1, team: null, nowMs })

  // 라운드는 0ms 에 시작했으므로 첫 힌트는 8초, 그 다음은 16초에 열린다
  assert.equal(at(0).nextHintAtMs, HINT_INTERVAL_MS)
  assert.equal(at(3_000).nextHintAtMs, HINT_INTERVAL_MS, '시간이 흘러도 같은 시각을 가리킨다')
  assert.equal(at(HINT_INTERVAL_MS).nextHintAtMs, HINT_INTERVAL_MS * 2)
  assert.equal(at(ROUND_MS).nextHintAtMs, null, '더 열릴 게 없으면 null')
})

// ── 연도 파싱 ───────────────────────────────────────

test('네 자리도 두 자리도 받는다', () => {
  assert.equal(parseYear('1997'), 1997)
  assert.equal(parseYear('1997년'), 1997)
  assert.equal(parseYear(' 1997 '), 1997)
  assert.equal(parseYear('97'), 1997, '두 자리는 채팅에서 자연스럽다')
  assert.equal(parseYear('97년'), 1997)
  assert.equal(parseYear('02'), 2002)
  assert.equal(parseYear('20'), 2020)
  assert.equal(parseYear('88'), 1988)
})

test('연도가 아닌 것은 null', () => {
  assert.equal(parseYear('아 모르겠다'), null)
  assert.equal(parseYear(''), null)
  assert.equal(parseYear('199'), null)
  assert.equal(parseYear('19970'), null)
  assert.equal(parseYear('50'), null, '50 은 1950 도 2050 도 범위 밖')
})

test('열린 힌트 수 계산', () => {
  assert.equal(openHintCount(0), 1)
  assert.equal(openHintCount(-100), 1)
  assert.equal(openHintCount(HINT_INTERVAL_MS), 2)
  assert.equal(openHintCount(HINT_INTERVAL_MS * 100), MAX_HINTS)
})

// ── 판정 ────────────────────────────────────────────

const question1997: GeuhaeQuestion = {
  year: 1997,
  hints: ['힌트1', '힌트2', '힌트3', '힌트4', '힌트5', '힌트6'],
  card: { prices: [], events: [] },
}

const judgeAt = (text: string, atMs = 1_000, round = freshRound(), playerId = P1) =>
  geuhaeGame.judge({ question: question1997, round, playerId, text, atMs })

test('정답 연도를 여러 표기로 받는다', () => {
  assert.equal(judgeAt('1997').kind, 'correct')
  assert.equal(judgeAt('97').kind, 'correct')
  assert.equal(judgeAt('1997년').kind, 'correct')
})

test('숫자가 아니면 판정하지 않는다', () => {
  assert.equal(judgeAt('아 이거 IMF 때 아닌가').kind, 'ignored')
  assert.equal(judgeAt('ㅋㅋㅋ').kind, 'ignored')
})

test('±1년은 부분 점수, 그리고 한 번만', () => {
  const first = judgeAt('1996')
  assert.equal(first.kind, 'partial')
  if (first.kind === 'partial') assert.equal(first.points, 30)

  assert.equal(judgeAt('1998').kind, 'partial', '아직 안 받았으면 1998 도 부분 점수')

  // 이미 부분 점수를 받은 사람은 더 못 받는다
  const used = { ...freshRound(), partials: [P1] }
  assert.equal(judgeAt('1996', 1_000, used).kind, 'wrong', '두 번째 ±1년은 오답')
  assert.equal(judgeAt('1996', 1_000, used, P2).kind, 'partial', '다른 사람은 아직 받을 수 있다')
})

test('한참 빗나간 연도는 오답', () => {
  assert.equal(judgeAt('1980').kind, 'wrong')
  assert.equal(judgeAt('2020').kind, 'wrong')
})

test('힌트가 적게 열렸을 때 맞히면 점수가 높다', () => {
  const early = judgeAt('1997', 1_000)
  const late = judgeAt('1997', HINT_INTERVAL_MS * 5 + 1_000)
  assert.equal(early.kind, 'correct')
  assert.equal(late.kind, 'correct')
  if (early.kind === 'correct' && late.kind === 'correct') {
    assert.ok(early.points > late.points, `이른 정답 ${early.points} > 늦은 정답 ${late.points}`)
  }
})

test('이미 맞힌 사람은 다시 판정하지 않는다', () => {
  const round = { ...freshRound(), solved: [P1] }
  assert.equal(judgeAt('1997', 1_000, round).kind, 'ignored')
})

// ── 결정성 · 종료 ───────────────────────────────────

test('같은 시드는 같은 연도를 만든다', () => {
  assert.deepEqual(makeQuestion('daily', 3), makeQuestion('daily', 3))
})

test('전원이 맞히면 라운드가 끝난다', () => {
  const round = { ...freshRound(2), solved: [P1] }
  assert.equal(geuhaeGame.isRoundOver(question1997, round), false)
  assert.equal(geuhaeGame.isRoundOver(question1997, { ...round, solved: [P1, P2] }), true)
})

test('공개 카드에 물가와 사건이 담긴다', () => {
  const question = makeQuestion('card')
  const revealed = geuhaeGame.reveal(question)
  assert.equal(revealed.answer, String(question.year))
  assert.deepEqual(revealed.detail, question.card)
})
