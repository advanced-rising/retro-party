import { type PlayerId } from '@retro/types';
import { type RoomGame } from '@retro/room-kit';
/**
 * 초성 퀴즈 — 02 문서 §2
 *
 * 20초. 초성 + 카테고리로 시작해 시간이 지나면 힌트가 열린다.
 * 채팅으로 답을 외치고, 서로 다른 정답으로 여러 명이 맞을 수 있다.
 */
export declare const ROUND_MS = 20000;
/** 서버만 보유한다. viewFor 를 거치지 않고는 클라이언트로 나갈 수 없다. */
export interface ChosungQuestion {
    readonly word: string;
    readonly chosung: string;
    readonly length: number;
    readonly category: string;
    readonly hint: string;
    readonly firstVowel: string | null;
    readonly answers: readonly string[];
}
/** 클라이언트가 받는 것. word 와 answers 가 없다. */
export interface ChosungView {
    readonly chosung: string;
    readonly length: number;
    readonly category: string;
    /** 8초 전에는 null */
    readonly hint: string | null;
    /** 14초 전에는 null */
    readonly firstVowel: string | null;
    readonly solvedCount: number;
    readonly youSolved: boolean;
}
export declare const chosungGame: RoomGame<ChosungQuestion, ChosungView>;
export { SAMPLE_WORDS, type ChosungWord } from './data.ts';
export type { PlayerId };
//# sourceMappingURL=index.d.ts.map