import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import { expandBanned, isDrawerView, sketchGame, ROUND_MS, type SketchQuestion } from './index.ts'
import { SAMPLE_SUBJECTS } from './data.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const DRAWER = asPlayerId('drawer')
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

function makeQuestion(presenter = DRAWER, seed = 'seed-1', roundNo = 0): SketchQuestion {
  return sketchGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    topics: [],
    presenter,
  })
}

const freshRound = (expectedSolvers = 3) =>
  emptyRound({ roundNo: 0, startedAtMs: 0, roundMs: ROUND_MS, expectedSolvers, presenter: DRAWER })

// ── ★ 정답 누출 ─────────────────────────────────────

test('맞히는 사람의 뷰에는 정답이 없다', () => {
  for (let i = 0; i < 30; i++) {
    const question = makeQuestion(DRAWER, 'leak', i)
    const view = sketchGame.viewFor({
      question,
      round: freshRound(),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    assert.equal(view.role, 'guesser')
    const serialized = JSON.stringify(view)
    assert.ok(!serialized.includes(question.word), `정답 "${question.word}" 이 샜다`)
    for (const answer of question.answers) {
      assert.ok(!serialized.includes(answer), `별칭 "${answer}" 이 샜다`)
    }
  }
})

test('그리는 사람만 정답을 본다', () => {
  const question = makeQuestion()
  const mine = sketchGame.viewFor({
    question,
    round: freshRound(),
    playerId: DRAWER,
    team: null,
    nowMs: 0,
  })
  assert.ok(isDrawerView(mine))
  if (isDrawerView(mine)) assert.equal(mine.word, question.word)
})

// ── ★ 그리는 사람은 말로 알려줄 수 없다 ──────────────

test('그리는 사람만 정답 단어가 막힌다', () => {
  const question = makeQuestion()
  const round = freshRound()
  const forDrawer = sketchGame.blockedWordsFor?.({ question, round, playerId: DRAWER }) ?? []
  const forGuesser = sketchGame.blockedWordsFor?.({ question, round, playerId: P1 }) ?? []

  assert.ok(forDrawer.length > 0, '그리는 사람은 답을 못 쓴다')
  assert.deepEqual(forGuesser, [], '맞히는 사람은 답을 쳐야 이긴다')
})

test('금칙어가 초성과 부분 문자열까지 확장된다', () => {
  const banned = expandBanned({
    word: '삐삐',
    topic: 'daily',
    category: '그때 그 물건',
    aliases: ['무선호출기'],
  })
  assert.ok(banned.includes('삐삐'))
  assert.ok(banned.includes('삐'))
  assert.ok(banned.includes('ㅃㅃ'))
  assert.ok(banned.includes('무선호출기'))
})

// ── 판정 ────────────────────────────────────────────

const fixture: SketchQuestion = {
  word: '자전거',
  category: '그때 그 물건',
  length: 3,
  answers: ['자전거'],
  banned: ['자전거', '자'],
  presenter: DRAWER,
}

const judge = (text: string, playerId = P1, round = freshRound()) =>
  sketchGame.judge({ question: fixture, round, playerId, text, atMs: 2_000 })

test('맞히면 정답, 그리는 사람이 쳐도 무시된다', () => {
  assert.equal(judge('자전거').kind, 'correct')
  assert.equal(judge('자전거', DRAWER).kind, 'ignored')
})

test('글자 수가 다르면 잡담으로 본다', () => {
  assert.equal(judge('아 뭐지 저거').kind, 'ignored')
  assert.equal(judge('오토바').kind, 'wrong', '3글자면 진지한 시도')
})

test('그리는 사람은 맞힌 사람 수만큼 받는다', () => {
  const bonus = (solved: readonly ReturnType<typeof asPlayerId>[]) =>
    sketchGame.roundEndBonus?.(fixture, { ...freshRound(), solved }) ?? []
  assert.deepEqual(bonus([]), [], '아무도 못 맞히면 0점')
  assert.deepEqual(bonus([P1, P2]), [[DRAWER, 80]])
})

// ── 소재 ────────────────────────────────────────────

test('★ 소재가 전부 그릴 수 있는 것이다', () => {
  // 추상 개념은 그림으로 성립하지 않는다.
  // **끝나는 말**로 본다 — 「운동장」은 그릴 수 있고 「새마을운동」은 못 그린다.
  // 포함으로 검사하면 운동장이 걸린다
  const ABSTRACT_SUFFIX = ['위기', '정책', '제도', '운동', '혁명', '조약', '이론', '주의', '사상']
  for (const subject of SAMPLE_SUBJECTS) {
    for (const bad of ABSTRACT_SUFFIX) {
      assert.ok(
        !subject.word.endsWith(bad),
        `"${subject.word}" 은 그림으로 표현하기 어렵다`,
      )
    }
    assert.ok(subject.word.length >= 2, `"${subject.word}" 은 너무 짧다`)
  }
})

test('소재에 인용이 없다', () => {
  for (const subject of SAMPLE_SUBJECTS) {
    assert.ok(!subject.word.includes('「'), `"${subject.word}" 에 인용 부호가 있다`)
  }
})

test('같은 시드는 같은 소재를 만든다', () => {
  assert.deepEqual(makeQuestion(DRAWER, 'daily', 2), makeQuestion(DRAWER, 'daily', 2))
})
