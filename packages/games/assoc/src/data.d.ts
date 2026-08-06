import type { NonEmptyArray } from '@retro/room-kit';
/**
 * 단어 연상 소재 — 02 문서 §3.9
 *
 * 초성 퀴즈와 단어 풀을 공유하되, **설명 가능한 단어만** 남긴다.
 * 콘텐츠 비용이 거의 0인 게임이다 — 설명은 사람이 만든다.
 *
 * `script` 는 혼자 모드 전용이다 (03 문서 §7.3 · 04 문서 §5.5.2).
 * 사람 출제자가 있으면 쓰이지 않는다. 화면에 가짜 출제자를 세우지 않고,
 * 설명이 문제의 일부로 표시된다.
 */
export interface AssocWord {
    readonly word: string;
    readonly category: string;
    /** 사전에 등록된 다른 정답 */
    readonly aliases: readonly string[];
    /** 출제자가 쓸 수 없는 말. 코드가 자동 확장한다 (02 문서 §3.4) */
    readonly banned: readonly string[];
    /** 혼자 모드에서 시간에 따라 흘릴 설명 3단계 */
    readonly script: readonly [string, string, string];
}
export declare const SAMPLE_WORDS: NonEmptyArray<AssocWord>;
//# sourceMappingURL=data.d.ts.map