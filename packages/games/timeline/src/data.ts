import type { TopicId } from '@retro/types'
import type { NonEmptyArray } from '@retro/room-kit'

/**
 * 연표 정렬 소재.
 *
 * 한 세트는 **같은 갈래의 사건 다섯 개**다. 서로 무관한 사건을 섞으면
 * 상식이 아니라 눈치 게임이 된다.
 *
 * 연도는 교과서·공공 기록으로 확인 가능한 것만 넣는다 (08 문서 §2).
 * 같은 해 사건이 둘 있어도 된다 — 그때는 둘 중 어느 순서든 정답으로 친다.
 */

export interface TimelineEvent {
  readonly year: number
  /** 연도를 유추할 수 있는 말은 넣지 않는다 */
  readonly text: string
}

export interface TimelineSet {
  readonly title: string
  readonly topic: TopicId
  readonly events: NonEmptyArray<TimelineEvent>
}

export const SAMPLE_SETS: NonEmptyArray<TimelineSet> = [
  {
    title: '한국 근현대',
    topic: 'history',
    events: [
      { year: 1876, text: '강화도조약이 맺어졌다' },
      { year: 1894, text: '동학농민운동이 일어났다' },
      { year: 1910, text: '국권이 강제로 넘어갔다' },
      { year: 1919, text: '전국에서 만세 운동이 일어났다' },
      { year: 1945, text: '광복을 맞았다' },
    ],
  },
  {
    title: '조선',
    topic: 'history',
    events: [
      { year: 1392, text: '조선이 세워졌다' },
      { year: 1446, text: '훈민정음이 반포됐다' },
      { year: 1592, text: '임진왜란이 일어났다' },
      { year: 1636, text: '병자호란이 일어났다' },
      { year: 1796, text: '수원화성이 완공됐다' },
    ],
  },
  {
    title: '현대 한국',
    topic: 'history',
    events: [
      { year: 1950, text: '한국전쟁이 일어났다' },
      { year: 1960, text: '학생들이 거리로 나섰다' },
      { year: 1970, text: '경부고속도로가 개통했다' },
      { year: 1987, text: '직선제 개헌이 이뤄졌다' },
      { year: 2000, text: '첫 남북정상회담이 열렸다' },
    ],
  },
  {
    title: '90년대 사건',
    topic: 'society',
    events: [
      { year: 1993, text: '문민정부가 출범했다' },
      { year: 1994, text: '성수대교가 무너졌다' },
      { year: 1995, text: '삼풍백화점이 무너졌다' },
      { year: 1997, text: 'IMF에 구제금융을 요청했다' },
      { year: 1998, text: '금 모으기 운동이 벌어졌다' },
    ],
  },
  {
    title: '2000년대 한국',
    topic: 'society',
    events: [
      { year: 2001, text: '인천국제공항이 문을 열었다' },
      { year: 2002, text: '한일 월드컵이 열렸다' },
      { year: 2004, text: '고속철도가 개통했다' },
      { year: 2008, text: '숭례문이 불에 탔다' },
      { year: 2018, text: '평창 동계올림픽이 열렸다' },
    ],
  },
  {
    title: '세계 현대사',
    topic: 'world',
    events: [
      { year: 1914, text: '제1차 세계대전이 시작됐다' },
      { year: 1939, text: '제2차 세계대전이 시작됐다' },
      { year: 1969, text: '인류가 달에 착륙했다' },
      { year: 1989, text: '베를린 장벽이 무너졌다' },
      { year: 2001, text: '뉴욕에서 테러가 일어났다' },
    ],
  },
  {
    title: '세계사 큰 흐름',
    topic: 'world',
    events: [
      { year: 1492, text: '콜럼버스가 항해에 나섰다' },
      { year: 1517, text: '종교개혁이 시작됐다' },
      { year: 1789, text: '프랑스혁명이 일어났다' },
      { year: 1863, text: '노예 해방이 선언됐다' },
      { year: 1945, text: '국제연합이 창설됐다' },
    ],
  },
  {
    title: 'IT 역사',
    topic: 'it',
    events: [
      { year: 1995, text: '국내에 인터넷이 본격 보급되기 시작했다' },
      { year: 1998, text: '스타크래프트가 국내에 들어왔다' },
      { year: 2001, text: '싸이월드 미니홈피가 서비스를 시작했다' },
      { year: 2010, text: '카카오톡이 출시됐다' },
      { year: 2016, text: '알파고가 바둑 대국을 벌였다' },
    ],
  },
  {
    title: '게임 역사',
    topic: 'game',
    events: [
      { year: 1996, text: '바람의나라가 서비스를 시작했다' },
      { year: 1998, text: '스타크래프트가 국내에 출시됐다' },
      { year: 1998, text: '리니지가 서비스를 시작했다' },
      { year: 2004, text: '카트라이더가 서비스를 시작했다' },
      { year: 2011, text: '리그오브레전드가 국내에 정식 서비스됐다' },
    ],
  },
  {
    title: '한국 스포츠',
    topic: 'sports',
    events: [
      { year: 1988, text: '서울 올림픽이 열렸다' },
      { year: 1994, text: '박찬호가 메이저리그에 데뷔했다' },
      { year: 1998, text: '박세리가 US 오픈에서 우승했다' },
      { year: 2002, text: '월드컵 4강에 올랐다' },
      { year: 2010, text: '김연아가 올림픽 금메달을 땄다' },
    ],
  },
  {
    title: '대중문화',
    topic: 'culture',
    events: [
      { year: 1992, text: '서태지와 아이들이 데뷔했다' },
      { year: 1996, text: 'H.O.T가 데뷔했다' },
      { year: 1999, text: '영화 쉬리가 개봉했다' },
      { year: 2003, text: '드라마 대장금이 방영됐다' },
      { year: 2012, text: '말춤이 세계적으로 유행했다' },
    ],
  },
  {
    title: '경제 흐름',
    topic: 'economy',
    events: [
      { year: 1988, text: '해외여행이 전면 자유화됐다' },
      { year: 1993, text: '금융실명제가 실시됐다' },
      { year: 1996, text: 'OECD에 가입했다' },
      { year: 1997, text: '외환위기가 닥쳤다' },
      { year: 2008, text: '세계 금융위기가 번졌다' },
    ],
  },
]
