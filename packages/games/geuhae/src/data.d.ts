import type { NonEmptyArray } from '@retro/room-kit';
/**
 * 「그 해」 연도 데이터 — Phase 0.5 검증용 샘플.
 *
 * 정식 콘텐츠는 04 문서의 파이프라인으로 연도당 30건 이상 × 41연도 = 1,200건을
 * 만들어 KV 에 넣는다. 여기 있는 것은 뼈대가 도는지 확인하기 위한 최소 세트다.
 *
 * **사실 오류가 이 게임의 최대 리스크다** (08 문서 §2).
 * 다수가 동시에 보므로 틀리면 즉시 발각된다. 아래 항목은 전부 검증 가능한 것만 넣었다.
 */
export interface YearEntry {
    readonly year: number;
    /**
     * 어려운 것부터 쉬운 것 순서. 앞에서부터 8초 간격으로 열린다.
     * 마지막 힌트는 거의 정답 수준이어야 한다 — 02 문서 §1.1
     */
    readonly hints: NonEmptyArray<string>;
    /** 정산 카드 — 이 게임의 콘텐츠 하이라이트다 (02 문서 §1.4) */
    readonly card: YearCard;
}
export interface YearCard {
    /** 「자장면 2,500원」 같은 물가 항목 */
    readonly prices: readonly string[];
    /** 그 해의 사건 */
    readonly events: readonly string[];
}
export declare const SAMPLE_YEARS: NonEmptyArray<YearEntry>;
//# sourceMappingURL=data.d.ts.map