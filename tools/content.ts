/**
 * 콘텐츠 검증 — 04 문서 §3 · 08 문서 §2
 *
 * **문항은 검증을 통과한 것만 들어간다.** 사실 오류가 이 제품의 최대 리스크다.
 * 다수가 동시에 같은 문제를 보므로, 틀리면 그 자리에서 발각되고 신뢰가 깎인다.
 *
 * 여기서 잡는 것은 기계가 잡을 수 있는 것뿐이다.
 *   · 정답이 힌트·설명에 그대로 들어갔는가 (제일 흔한 사고)
 *   · 초성이 실제 단어에서 나오는가
 *   · 주제 안에서 중복인가 (주제가 다르면 중복이어도 된다)
 *   · 물가에 근거가 달려 있는가
 *
 * 사실 자체가 맞는지는 기계가 모른다. 그건 사람 검수와 신고(제보) 몫이다.
 *
 *   pnpm content          검사만
 *   pnpm content --stats  주제별 분포까지
 */

import { SAMPLE_WORDS as CHOSUNG } from '@retro/game-chosung'
import { SAMPLE_YEARS } from '@retro/game-geuhae'
import { SAMPLE_WORDS as ASSOC, expandBanned } from '@retro/game-assoc'
import { SAMPLE_PRICES } from '@retro/game-mulga'
import { normalizeAnswer, syllableLength, toChosung } from '@retro/room-kit'
import { TOPIC_IDS, topicLabel, type TopicId } from '@retro/types'

const problems: string[] = []
const stats = new Map<string, Map<TopicId, number>>()

function fail(where: string, message: string): void {
  problems.push(`  ${where}  ${message}`)
}

function count(game: string, topic: TopicId): void {
  const byTopic = stats.get(game) ?? new Map<TopicId, number>()
  byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1)
  stats.set(game, byTopic)
}

/** 주제 안에서만 중복을 막는다. 주제가 다르면 같은 소재가 또 나와도 된다 */
function checkDuplicates(game: string, keys: readonly (readonly [string, TopicId])[]): void {
  const seen = new Set<string>()
  for (const [key, topic] of keys) {
    const composite = `${topic}:${key}`
    if (seen.has(composite)) fail(game, `같은 주제(${topicLabel(topic)})에 중복: ${key}`)
    seen.add(composite)
  }
}

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const isHangulWord = (word: string): boolean =>
  [...word].some((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return code >= HANGUL_START && code <= HANGUL_END
  })

// ── 초성 퀴즈 ────────────────────────────────────────

function checkChosung(): void {
  const where = '초성 퀴즈'
  checkDuplicates(where, CHOSUNG.map((w) => [w.word, w.topic] as const))

  for (const entry of CHOSUNG) {
    count('초성 퀴즈', entry.topic)
    const label = `${entry.word}(${topicLabel(entry.topic)})`

    if (!TOPIC_IDS.includes(entry.topic)) fail(where, `${label} — 알 수 없는 주제`)
    if (entry.word.trim().length === 0) fail(where, '빈 단어')
    if (entry.hint.trim().length === 0) fail(where, `${label} — 힌트가 없다`)
    if (entry.category.trim().length === 0) fail(where, `${label} — 카테고리가 없다`)

    // 초성을 코드로 뽑으므로 한글이 아니면 문제가 성립하지 않는다
    if (!isHangulWord(entry.word)) fail(where, `${label} — 한글이 아니라 초성을 못 만든다`)
    if (syllableLength(entry.word) < 2) fail(where, `${label} — 한 글자는 너무 쉽다`)

    // ★ 정답이 힌트에 그대로 있으면 문제가 아니다
    const answer = normalizeAnswer(entry.word)
    const hint = normalizeAnswer(entry.hint)
    if (hint.includes(answer)) fail(where, `${label} — 힌트에 정답이 들어 있다: "${entry.hint}"`)
    if (entry.hint.includes(toChosung(entry.word))) {
      fail(where, `${label} — 힌트에 초성이 그대로 있다`)
    }
    for (const alias of entry.aliases) {
      if (hint.includes(normalizeAnswer(alias))) {
        fail(where, `${label} — 힌트에 별칭 "${alias}" 이 들어 있다`)
      }
      if (normalizeAnswer(alias) === answer) fail(where, `${label} — 별칭이 정답과 같다`)
    }
  }
}

// ── 그 해 ────────────────────────────────────────────

function checkGeuhae(): void {
  const where = '그 해'
  checkDuplicates(
    where,
    SAMPLE_YEARS.map((y) => [String(y.year), y.topic] as const),
  )

  for (const entry of SAMPLE_YEARS) {
    count('그 해', entry.topic)
    const label = `${entry.year}(${topicLabel(entry.topic)})`

    if (entry.year < 1980 || entry.year > 2025) fail(where, `${label} — 연도 범위 밖`)
    if (entry.hints.length < 4) fail(where, `${label} — 힌트가 ${entry.hints.length}개뿐`)

    // ★ 힌트에 정답 연도가 있으면 첫 힌트에서 끝난다
    for (const hint of entry.hints) {
      if (hint.includes(String(entry.year))) {
        fail(where, `${label} — 힌트에 정답 연도가 있다: "${hint}"`)
      }
      const short = String(entry.year).slice(2)
      if (new RegExp(`\\b${short}년`).test(hint)) {
        fail(where, `${label} — 힌트에 두 자리 연도가 있다: "${hint}"`)
      }
    }
    if (entry.card.events.length === 0) fail(where, `${label} — 정산 카드에 사건이 없다`)
  }
}

// ── 단어 연상 ────────────────────────────────────────

function checkAssoc(): void {
  const where = '단어 연상'
  checkDuplicates(where, ASSOC.map((w) => [w.word, w.topic] as const))

  for (const entry of ASSOC) {
    count('단어 연상', entry.topic)
    const label = `${entry.word}(${topicLabel(entry.topic)})`

    if (!isHangulWord(entry.word)) fail(where, `${label} — 한글이 아니다`)
    if (entry.script.length !== 3) fail(where, `${label} — 설명이 3단계가 아니다`)

    // ★ 혼자 모드 스크립트가 정답을 흘리면 게임이 성립하지 않는다
    const banned = expandBanned(entry)
    for (const line of entry.script) {
      if (line.trim().length === 0) fail(where, `${label} — 빈 설명 줄`)
      const normalized = normalizeAnswer(line)
      if (normalized.includes(normalizeAnswer(entry.word))) {
        fail(where, `${label} — 설명에 정답이 들어 있다: "${line}"`)
      }
      for (const alias of entry.aliases) {
        if (normalized.includes(normalizeAnswer(alias))) {
          fail(where, `${label} — 설명에 별칭 "${alias}" 이 들어 있다: "${line}"`)
        }
      }
    }
    if (banned.length === 0) fail(where, `${label} — 금칙어가 하나도 안 만들어졌다`)
  }
}

// ── 그때 그 가격 ─────────────────────────────────────

function checkMulga(): void {
  const where = '그때 그 가격'
  checkDuplicates(
    where,
    SAMPLE_PRICES.map((p) => [`${p.item}:${p.year}`, p.topic] as const),
  )

  for (const entry of SAMPLE_PRICES) {
    count('그때 그 가격', entry.topic)
    const label = `${entry.item} ${entry.year}`

    // ★ 근거 없는 물가는 넣지 않는다. 여기가 이 게임의 생명선이다
    if (entry.source.trim().length === 0) fail(where, `${label} — 검증 근거가 없다`)
    if (entry.price <= 0) fail(where, `${label} — 가격이 0 이하`)
    if (entry.year < 1980 || entry.year > 2025) fail(where, `${label} — 연도 범위 밖`)
    if (entry.note.includes(String(entry.price))) fail(where, `${label} — 단서에 정답이 있다`)
    if (/\d{3,}/.test(entry.note)) fail(where, `${label} — 단서에 가격처럼 보이는 숫자가 있다`)
  }
}

// ── 실행 ─────────────────────────────────────────────

checkChosung()
checkGeuhae()
checkAssoc()
checkMulga()

const total = [...stats.values()].reduce(
  (sum, byTopic) => sum + [...byTopic.values()].reduce((a, b) => a + b, 0),
  0,
)

console.log(`콘텐츠 검증 — 총 ${total}문항\n`)

for (const [game, byTopic] of stats) {
  const sum = [...byTopic.values()].reduce((a, b) => a + b, 0)
  console.log(`  ${game}  ${sum}`)
  if (process.argv.includes('--stats')) {
    for (const topic of TOPIC_IDS) {
      const n = byTopic.get(topic) ?? 0
      if (n > 0) console.log(`      ${topicLabel(topic).padEnd(8)} ${String(n).padStart(4)}`)
    }
  }
}

// 주제마다 문제가 너무 적으면 그 주제를 고른 방이 같은 문제만 돈다
const THIN = 8
for (const [game, byTopic] of stats) {
  for (const [topic, n] of byTopic) {
    if (n < THIN) {
      console.log(`\n  참고: ${game} · ${topicLabel(topic)} 이 ${n}문항뿐입니다 (권장 ${THIN}+)`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\n검증 실패 ${problems.length}건\n`)
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

console.log('\n전 항목 통과.')
