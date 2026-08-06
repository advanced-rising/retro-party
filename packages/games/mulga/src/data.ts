import type { TopicId } from '@retro/types'
import type { NonEmptyArray } from '@retro/room-kit'

/**
 * 「그때 그 가격」 물가 데이터 — Phase 0.5 검증용 샘플.
 *
 * **사실 오류가 이 게임의 최대 리스크다** (08 문서 §2).
 * 「그 해」보다 더하다 — 연도는 틀리면 하나가 틀리지만, 가격은 사람마다
 * "내 기억엔 그거 아니었는데"가 바로 나온다.
 *
 * 그래서 두 가지를 지킨다.
 *   1. **공표된 값만 쓴다** — 공공요금, 최저임금, 정부 고시가처럼 근거가 있는 것
 *   2. 근거를 `source` 에 남긴다. 검증 없이 들어온 항목은 붙이지 않는다
 *
 * 자장면처럼 지역·가게마다 다른 항목은 "전국 평균"임을 문항에 명시한다.
 */

export interface PriceEntry {
  readonly item: string
  readonly topic: TopicId
  readonly year: number
  readonly price: number
  readonly unit: string
  /** 문항에 함께 띄우는 단서. 정답 숫자를 유추할 수 있는 말은 넣지 않는다 */
  readonly note: string
  /** 검증 근거. 사람 검수 때 여기를 본다 */
  readonly source: string
}

export const SAMPLE_PRICES: NonEmptyArray<PriceEntry> = [
  {
    item: '자장면 한 그릇',
    topic: 'daily',
    year: 1990,
    price: 1100,
    unit: '원',
    note: '전국 평균 외식비 기준',
    source: '한국소비자원 외식비 가격 동향',
  },
  {
    item: '자장면 한 그릇',
    topic: 'daily',
    year: 2000,
    price: 2900,
    unit: '원',
    note: '전국 평균 외식비 기준',
    source: '한국소비자원 외식비 가격 동향',
  },
  {
    item: '서울 지하철 기본요금',
    topic: 'society',
    year: 1990,
    price: 250,
    unit: '원',
    note: '성인 1구간 기준',
    source: '서울교통공사 요금 변천',
  },
  {
    item: '서울 지하철 기본요금',
    topic: 'society',
    year: 2000,
    price: 500,
    unit: '원',
    note: '성인 1구간 기준',
    source: '서울교통공사 요금 변천',
  },
  {
    item: '서울 지하철 기본요금',
    topic: 'society',
    year: 2015,
    price: 1250,
    unit: '원',
    note: '성인 교통카드 기준',
    source: '서울교통공사 요금 변천',
  },
  {
    item: '최저임금 시급',
    topic: 'economy',
    year: 1997,
    price: 1485,
    unit: '원',
    note: '고용노동부 고시',
    source: '최저임금위원회 연도별 최저임금',
  },
  {
    item: '최저임금 시급',
    topic: 'economy',
    year: 2005,
    price: 2840,
    unit: '원',
    note: '고용노동부 고시',
    source: '최저임금위원회 연도별 최저임금',
  },
  {
    item: '최저임금 시급',
    topic: 'economy',
    year: 2015,
    price: 5580,
    unit: '원',
    note: '고용노동부 고시',
    source: '최저임금위원회 연도별 최저임금',
  },
  {
    item: '최저임금 시급',
    topic: 'economy',
    year: 2020,
    price: 8590,
    unit: '원',
    note: '고용노동부 고시',
    source: '최저임금위원회 연도별 최저임금',
  },
  {
    item: '시내버스 요금',
    topic: 'society',
    year: 1995,
    price: 400,
    unit: '원',
    note: '서울 일반 노선 현금 기준',
    source: '서울시 대중교통 요금 변천',
  },
  {
    item: '편지 우표 한 장',
    topic: 'society',
    year: 1995,
    price: 130,
    unit: '원',
    note: '규격 통상우편 기준',
    source: '우정사업본부 우편요금 변천',
  },
  {
    item: '편지 우표 한 장',
    topic: 'society',
    year: 2010,
    price: 250,
    unit: '원',
    note: '규격 통상우편 기준',
    source: '우정사업본부 우편요금 변천',
  },
]
