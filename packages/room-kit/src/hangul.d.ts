/**
 * 한글 자모 유틸 — 초성 퀴즈와 단어 연상 금칙어 생성에 쓴다.
 */
declare const CHOSUNG: readonly ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
declare const JUNGSUNG: readonly ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
export type Chosung = (typeof CHOSUNG)[number];
export type Jungsung = (typeof JUNGSUNG)[number];
/** '삐삐' → 'ㅃㅃ'. 한글이 아닌 글자는 그대로 둔다. */
export declare function toChosung(word: string): string;
/** 첫 글자의 중성. 초성 퀴즈 2단계 힌트에 쓴다. '삐삐' → 'ㅣ' */
export declare function firstJungsung(word: string): Jungsung | null;
/**
 * 정답 비교용 정규화.
 * 공백·문장부호를 지우고 소문자로 — 채팅으로 빨리 치는 상황을 관대하게 받는다.
 */
export declare function normalizeAnswer(input: string): string;
/** 글자 수 (자모 결합 기준). '삐삐' → 2 */
export declare function syllableLength(word: string): number;
export {};
//# sourceMappingURL=hangul.d.ts.map