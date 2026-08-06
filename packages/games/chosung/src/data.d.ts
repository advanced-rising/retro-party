import type { NonEmptyArray } from '@retro/room-kit';
/**
 * 초성 퀴즈 문제 풀 — Phase 0.5 검증용 샘플.
 *
 * 정식 콘텐츠는 04 문서의 파이프라인으로 1,500개를 만들어 KV 에 넣고,
 * 방 생성 시 한 번 읽어 DO 메모리에 들고 있는다 (05 문서 §5).
 * 여기 있는 것은 뼈대가 도는지 확인하기 위한 최소 세트다.
 */
export interface ChosungWord {
    readonly word: string;
    readonly category: string;
    /** 8초에 공개되는 설명 한 줄 */
    readonly hint: string;
    /** 사전에 등록된 다른 정답. 복수 정답 허용 — 02 문서 §2.3 */
    readonly aliases: readonly string[];
}
export declare const SAMPLE_WORDS: NonEmptyArray<ChosungWord>;
//# sourceMappingURL=data.d.ts.map