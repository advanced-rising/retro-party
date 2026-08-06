import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import { chosungGame, ROUND_MS, type ChosungQuestion } from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

function makeQuestion(seed = 'seed-1', roundNo = 0): ChosungQuestion {
  return chosungGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    presenter: null,
  })
}

const freshRound = (startedAtMs = 0, expectedSolvers = 4) =>
  emptyRound({ roundNo: 0, startedAtMs, roundMs: ROUND_MS, expectedSolvers, presenter: null })

// ── ★ 최우선: 정답 누출 ──────────────────────────────

test('viewFor 가 정답을 흘리지 않는다', () => {
  for (let i = 0; i < 50; i++) {
    const question = makeQuestion('leak', i)
    // 라운드 끝 시점(모든 힌트 공개)에도 정답이 없어야 한다
    const view = chosungGame.viewFor({
      question,
      round: freshRound(),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    const serialized = JSON.stringify(view)

    assert.ok(
      !serialized.includes(question.word),
      `정답 "${question.word}" 이 뷰에 노출됨: ${serialized}`,
    )
    for (const answer of question.answers) {
      assert.ok(!serialized.includes(answer), `별칭 "${answer}" 이 뷰에 노출됨`)
    }
  }
})

test('힌트는 시간이 지나야 열린다', () => {
  const question = makeQuestion('hint')
  const at = (nowMs: number) =>
    chosungGame.viewFor({ question, round: freshRound(), playerId: P1, team: null, nowMs })

  assert.equal(at(0).hint, null, '0초에는 설명 힌트가 없어야 한다')
  assert.equal(at(0).firstVowel, null, '0초에는 모음 힌트가 없어야 한다')
  assert.equal(at(8_000).hint, question.hint)
  assert.equal(at(8_000).firstVowel, null, '8초에는 아직 모음이 없어야 한다')
  assert.equal(at(14_000).firstVowel, question.firstVowel)
})

// ── 결정성 ───────────────────────────────────────────

test('같은 시드는 같은 문제를 만든다', () => {
  const a = makeQuestion('daily-2026-08-06', 3)
  const b = makeQuestion('daily-2026-08-06', 3)
  assert.deepEqual(a, b)
})

test('다른 시드는 다른 문제를 만든다', () => {
  const words = new Set<string>()
  for (let i = 0; i < 20; i++) words.add(makeQuestion('spread', i).word)
  assert.ok(words.size > 1, '20 라운드가 전부 같은 단어면 시드 파생이 깨진 것')
})

// ── 판정 ─────────────────────────────────────────────

test('정답 · 별칭 · 표기 흔들림을 받는다', () => {
  const question: ChosungQuestion = {
    word: '삐삐',
    chosung: 'ㅃㅃ',
    length: 2,
    category: '90년대 물건',
    hint: '허리에 차고 다녔다',
    firstVowel: 'ㅣ',
    answers: ['삐삐', '무선호출기'],
  }
  const judge = (text: string, round = freshRound()) =>
    chosungGame.judge({ question, round, playerId: P1, text, atMs: 1_000 })

  assert.equal(judge('삐삐').kind, 'correct')
  assert.equal(judge(' 삐삐 ').kind, 'correct', '앞뒤 공백은 무시')
  assert.equal(judge('무선호출기').kind, 'correct', '별칭도 정답')
  assert.equal(judge('전화').kind, 'wrong', '글자 수가 같은 오답은 시도로 본다')
  assert.equal(judge('빠빠').kind, 'wrong', '초성이 같은 오답도 시도로 본다')
  assert.equal(judge('아 이거 뭐였지').kind, 'ignored', '잡담은 판정하지 않는다')
})

test('빠를수록 점수가 높다 — 초 단위로 계속 깎인다', () => {
  const question = makeQuestion('speed')
  const fast = chosungGame.judge({
    question,
    round: freshRound(),
    playerId: P1,
    text: question.word,
    atMs: 2_000,
  })
  const slow = chosungGame.judge({
    question,
    round: freshRound(),
    playerId: P1,
    text: question.word,
    atMs: 15_000,
  })
  assert.equal(fast.kind, 'correct')
  assert.equal(slow.kind, 'correct')
  if (fast.kind === 'correct' && slow.kind === 'correct') {
    assert.ok(fast.points > slow.points, '5초 이내 정답이 더 높아야 한다')
  }
})

test('이미 맞힌 사람의 재입력은 무시한다', () => {
  const question = makeQuestion('dup')
  const round = { ...freshRound(), solved: [P1] }
  const again = chosungGame.judge({
    question,
    round,
    playerId: P1,
    text: question.word,
    atMs: 3_000,
  })
  assert.equal(again.kind, 'ignored')

  const other = chosungGame.judge({
    question,
    round,
    playerId: P2,
    text: question.word,
    atMs: 3_000,
  })
  assert.equal(other.kind, 'correct')
  if (other.kind === 'correct') assert.equal(other.rank, 1, '두 번째 정답자는 2등')
})

test('전원이 맞히면 라운드가 조기 종료된다', () => {
  const question = makeQuestion('over')
  assert.equal(chosungGame.isRoundOver(question, { ...freshRound(0, 2), solved: [P1] }), false)
  assert.equal(chosungGame.isRoundOver(question, { ...freshRound(0, 2), solved: [P1, P2] }), true)
})
