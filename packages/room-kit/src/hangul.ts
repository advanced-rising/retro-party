/**
 * 한글 자모 유틸 — 초성 퀴즈와 단어 연상 금칙어 생성에 쓴다.
 */

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3
const JUNG_COUNT = 21
const JONG_COUNT = 28

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

const JUNGSUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ',
] as const

export type Chosung = (typeof CHOSUNG)[number]
export type Jungsung = (typeof JUNGSUNG)[number]

const isSyllable = (code: number): boolean => code >= HANGUL_BASE && code <= HANGUL_LAST

/** '삐삐' → 'ㅃㅃ'. 한글이 아닌 글자는 그대로 둔다. */
export function toChosung(word: string): string {
  let out = ''
  for (const char of word) {
    const code = char.codePointAt(0)
    if (code === undefined || !isSyllable(code)) {
      out += char
      continue
    }
    const index = Math.floor((code - HANGUL_BASE) / (JUNG_COUNT * JONG_COUNT))
    out += CHOSUNG[index] ?? char
  }
  return out
}

/** 첫 글자의 중성. 초성 퀴즈 2단계 힌트에 쓴다. '삐삐' → 'ㅣ' */
export function firstJungsung(word: string): Jungsung | null {
  const char = [...word][0]
  if (char === undefined) return null
  const code = char.codePointAt(0)
  if (code === undefined || !isSyllable(code)) return null
  const index = Math.floor(((code - HANGUL_BASE) % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT)
  return JUNGSUNG[index] ?? null
}

/**
 * 정답 비교용 정규화.
 * 공백·문장부호를 지우고 소문자로 — 채팅으로 빨리 치는 상황을 관대하게 받는다.
 */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s.,!?~·・'"()[\]{}<>/\\|-]/g, '')
}

/** 글자 수 (자모 결합 기준). '삐삐' → 2 */
export function syllableLength(word: string): number {
  return [...word].length
}
