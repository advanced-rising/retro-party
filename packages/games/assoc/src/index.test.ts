import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asPlayerId, asSeed } from '@retro/types'
import { createRng, emptyRound, type ContentPool } from '@retro/room-kit'
import { assocGame, expandBanned, isPresenterView, ROUND_MS, type AssocQuestion } from './index.ts'

const EMPTY_POOL: ContentPool = { version: 'sample', items: [] }
const HOST = asPlayerId('presenter')
const P1 = asPlayerId('p1')
const P2 = asPlayerId('p2')

function makeQuestion(
  presenter: ReturnType<typeof asPlayerId> | null = HOST,
  seed = 'seed-1',
  roundNo = 0,
): AssocQuestion {
  return assocGame.createRound({
    seed: asSeed(seed),
    roundNo,
    rng: createRng(asSeed(`${seed}:${roundNo}`)),
    pool: EMPTY_POOL,
    topics: [],
    presenter,
  })
}

const freshRound = (presenter: ReturnType<typeof asPlayerId> | null = HOST, expectedSolvers = 3) =>
  emptyRound({ roundNo: 0, startedAtMs: 0, roundMs: ROUND_MS, expectedSolvers, presenter })

const view = (question: AssocQuestion, playerId = P1, nowMs = 0) =>
  assocGame.viewFor({ question, round: freshRound(question.presenter), playerId, team: null, nowMs })

// ── ★ 정답 누출 — 이 게임의 핵심 ─────────────────────

test('맞히는 사람의 뷰에는 정답이 없다', () => {
  for (let i = 0; i < 30; i++) {
    const question = makeQuestion(HOST, 'leak', i)
    const guesser = view(question, P1, ROUND_MS)
    assert.equal(guesser.role, 'guesser')

    const serialized = JSON.stringify(guesser)
    assert.ok(!serialized.includes(question.word), `정답 "${question.word}" 이 샜다: ${serialized}`)
    for (const answer of question.answers) {
      assert.ok(!serialized.includes(answer), `별칭 "${answer}" 이 샜다`)
    }
  }
})

test('출제자의 뷰에는 정답이 있다 — 그래야 설명한다', () => {
  const question = makeQuestion()
  const mine = view(question, HOST)
  assert.ok(isPresenterView(mine))
  if (isPresenterView(mine)) {
    assert.equal(mine.word, question.word)
    assert.ok(mine.banned.length > 0, '금칙어 목록을 보여줘야 답답하지 않다')
  }
})

test('맞히는 사람은 카테고리와 글자 수만 받는다', () => {
  const question = makeQuestion()
  const guesser = view(question)
  if (guesser.role !== 'guesser') throw new Error('guesser 뷰여야 한다')
  assert.equal(guesser.category, question.category)
  assert.equal(guesser.length, question.length)
  assert.equal(guesser.presenter, HOST)
})

// ── ★ 금칙어는 출제자에게만 ─────────────────────────

test('출제자만 정답을 말할 수 없다', () => {
  const question = makeQuestion()
  const round = freshRound()

  const forPresenter = assocGame.blockedWordsFor?.({ question, round, playerId: HOST }) ?? []
  const forGuesser = assocGame.blockedWordsFor?.({ question, round, playerId: P1 }) ?? []

  assert.ok(forPresenter.length > 0, '출제자는 정답을 막아야 한다')
  assert.deepEqual(forGuesser, [], '맞히는 사람은 정답을 쳐야 이긴다 — 막으면 게임이 안 된다')
})

test('금칙어가 부분 문자열·초성·반복까지 확장된다', () => {
  const banned = expandBanned({
    word: '삐삐',
    topic: 'daily',
    category: '90년대 물건',
    aliases: ['무선호출기'],
    banned: ['beeper'],
    script: ['a', 'b', 'c'],
  })
  assert.ok(banned.includes('삐삐'), '정답 그 자체')
  assert.ok(banned.includes('삐'), '부분 문자열')
  assert.ok(banned.includes('ㅃㅃ'), '초성')
  assert.ok(banned.includes('삐삐삐'), '반복 변형')
  assert.ok(banned.includes('무선호출기'), '별칭')
  assert.ok(banned.includes('beeper'), '영문 표기')
})

// ── 판정 ────────────────────────────────────────────

const fixture: AssocQuestion = {
  word: '삐삐',
  category: '90년대 물건',
  length: 2,
  answers: ['삐삐', '무선호출기'],
  banned: ['삐삐', '삐'],
  script: ['허리에 차던 거', '숫자를 보냈다', '8282'],
  presenter: HOST,
}

const judge = (text: string, playerId = P1, round = freshRound()) =>
  assocGame.judge({ question: fixture, round, playerId, text, atMs: 1_000 })

test('맞히는 사람의 정답과 별칭을 받는다', () => {
  assert.equal(judge('삐삐').kind, 'correct')
  assert.equal(judge('무선호출기').kind, 'correct')
  assert.equal(judge(' 삐삐 ').kind, 'correct')
})

test('출제자가 정답을 쳐도 점수가 되지 않는다', () => {
  assert.equal(judge('삐삐', HOST).kind, 'ignored')
})

test('글자 수가 다르면 설명에 대한 잡담으로 본다', () => {
  assert.equal(judge('아 알겠다 그거').kind, 'ignored')
  assert.equal(judge('전화').kind, 'wrong', '2글자면 진지한 시도')
})

test('먼저 맞힌 사람이 더 받는다', () => {
  const first = judge('삐삐', P1)
  const second = judge('삐삐', P2, { ...freshRound(), solved: [P1] })
  assert.equal(first.kind, 'correct')
  assert.equal(second.kind, 'correct')
  if (first.kind === 'correct' && second.kind === 'correct') {
    assert.ok(first.points > second.points)
  }
})

// ── ★ 출제자 보너스 ─────────────────────────────────

test('출제자는 맞힌 사람 수만큼 받는다', () => {
  const bonus = (solved: readonly ReturnType<typeof asPlayerId>[]) =>
    assocGame.roundEndBonus?.(fixture, { ...freshRound(), solved }) ?? []

  assert.deepEqual(bonus([]), [], '아무도 못 맞히면 0점 — 너무 어렵게 내면 본인 손해')
  assert.deepEqual(bonus([P1]), [[HOST, 40]])
  assert.deepEqual(bonus([P1, P2]), [[HOST, 80]])

  const many = [P1, P2, asPlayerId('p3'), asPlayerId('p4'), asPlayerId('p5')]
  assert.deepEqual(bonus(many), [[HOST, 160]], '상한 160')
})

// ── ★ 혼자 모드 ─────────────────────────────────────

test('출제자가 없으면 스크립트가 시간에 따라 열린다', () => {
  const solo = makeQuestion(null, 'solo')
  const at = (nowMs: number) => {
    const v = assocGame.viewFor({
      question: solo,
      round: freshRound(null, 1),
      playerId: P1,
      team: null,
      nowMs,
    })
    if (v.role !== 'guesser') throw new Error('guesser 뷰여야 한다')
    return v
  }

  assert.equal(at(0).script.length, 1, '시작에는 설명 1단계')
  assert.equal(at(29_000).script.length, 1)
  assert.equal(at(30_000).script.length, 2)
  assert.equal(at(60_000).script.length, 3)
  assert.equal(at(0).presenter, null, '가짜 출제자를 세우지 않는다')
})

test('혼자 모드 스크립트에도 정답이 없다', () => {
  for (let i = 0; i < 20; i++) {
    const solo = makeQuestion(null, 'solo-leak', i)
    const v = assocGame.viewFor({
      question: solo,
      round: freshRound(null, 1),
      playerId: P1,
      team: null,
      nowMs: ROUND_MS,
    })
    assert.ok(
      !JSON.stringify(v).includes(solo.word),
      `스크립트가 정답 "${solo.word}" 을 흘렸다`,
    )
  }
})

test('혼자 모드에는 출제자 보너스가 없다', () => {
  const solo = makeQuestion(null, 'solo')
  assert.deepEqual(assocGame.roundEndBonus?.(solo, { ...freshRound(null), solved: [P1] }), [])
})

test('같은 시드는 같은 단어를 만든다', () => {
  assert.deepEqual(makeQuestion(HOST, 'daily', 2), makeQuestion(HOST, 'daily', 2))
})
