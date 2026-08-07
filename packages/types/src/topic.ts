/**
 * 주제 — 방을 만들 때 고르는 분야.
 *
 * **시대와 직교한다.** 이 제품의 정체성은 90년대 향수지만, 주제를 시대에
 * 묶어버리면 콘텐츠가 거기서 끝난다. 문항은 `topic`(무엇에 대한 것인가)과
 * `era`(언제인가)를 따로 들고, 방은 주제로 고르고 시대로 다시 좁힌다.
 *
 * 그래서 「90년대 IT」도 「세계사 전반」도 같은 구조에 들어간다.
 */

export const TOPIC_IDS = [
  'daily',
  'culture',
  'drama',
  'movie',
  'anime-kr',
  'anime-jp',
  'music',
  'economy',
  'it',
  'game',
  'food',
  'place',
  'nature',
  'science',
  'saying',
  'holiday',
  'society',
  'history',
  'world',
  'sports',
  'football',
  'baseball',
  'basketball',
] as const

export type TopicId = (typeof TOPIC_IDS)[number]

export interface TopicInfo {
  readonly id: TopicId
  readonly label: string
  /** 방 만들기 화면의 한 줄 설명 */
  readonly hint: string
  /** Lucide 아이콘 이름. 웹이 매핑한다 — 이모지는 쓰지 않는다 */
  readonly icon: string
}

export const TOPICS: readonly TopicInfo[] = [
  { id: 'daily', label: '생활·물건', hint: '삐삐 · 오락실 · 그때 그 과자', icon: 'package' },
  { id: 'culture', label: '문화 종합', hint: '예능 · 방송 · 연예 전반', icon: 'clapperboard' },
  { id: 'drama', label: '드라마', hint: '모래시계부터 대장금까지', icon: 'tv' },
  { id: 'movie', label: '영화', hint: '쉬리 · 올드보이 · 기생충', icon: 'film' },
  { id: 'anime-kr', label: '한국 만화', hint: '둘리 · 검정고무신 · 태권브이', icon: 'book-open' },
  { id: 'anime-jp', label: '일본 애니', hint: '슬램덩크 · 드래곤볼 · 짱구', icon: 'sparkles' },
  { id: 'music', label: '가요·음악', hint: '서태지부터 아이돌까지', icon: 'music' },
  { id: 'economy', label: '경제', hint: '물가 · 환율 · 기업', icon: 'trending-up' },
  { id: 'it', label: 'IT·기술', hint: 'PC통신 · 컴퓨터 · 인터넷', icon: 'cpu' },
  { id: 'game', label: '게임', hint: '오락실 · 스타 · 온라인 게임', icon: 'gamepad-2' },
  { id: 'food', label: '음식', hint: '분식 · 국물 · 그때 그 맛', icon: 'utensils' },
  { id: 'place', label: '장소·지리', hint: '도시 · 명소 · 우리 동네', icon: 'map-pin' },
  { id: 'nature', label: '동물·자연', hint: '동물 · 식물 · 날씨', icon: 'leaf' },
  { id: 'science', label: '과학·상식', hint: '우주 · 몸 · 생활 과학', icon: 'flask-conical' },
  { id: 'saying', label: '속담·한자', hint: '속담 · 사자성어 · 관용구', icon: 'book-marked' },
  { id: 'holiday', label: '명절·풍습', hint: '설 · 추석 · 세시풍속', icon: 'gift' },
  { id: 'society', label: '정치·사회', hint: '선거 · 사건 · 제도', icon: 'landmark' },
  { id: 'history', label: '한국사', hint: '조선부터 근현대까지', icon: 'scroll' },
  { id: 'world', label: '세계사', hint: '전쟁 · 혁명 · 인물', icon: 'globe' },
  { id: 'sports', label: '스포츠 종합', hint: '올림픽 · 종목 전반 · 인물', icon: 'trophy' },
  { id: 'football', label: '축구', hint: '월드컵 · K리그 · 해외파', icon: 'goal' },
  { id: 'baseball', label: '야구', hint: 'KBO · 한국시리즈 · 메이저리그', icon: 'circle-dot' },
  { id: 'basketball', label: '농구', hint: 'KBL · NBA · 슬램덩크 세대', icon: 'dribbble' },
]

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]))

export function topicInfo(id: TopicId): TopicInfo | undefined {
  return BY_ID.get(id)
}

export function topicLabel(id: TopicId): string {
  return BY_ID.get(id)?.label ?? id
}

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === 'string' && (TOPIC_IDS as readonly string[]).includes(value)
}

/** 신뢰할 수 없는 입력에서 주제 목록을 좁힌다. 중복은 지운다 */
export function parseTopics(raw: unknown): readonly TopicId[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter(isTopicId))]
}

/** 주제를 담고 있는 콘텐츠 항목이 만족해야 하는 최소 모양 */
export interface Topical {
  readonly topic: TopicId
}

/**
 * 고른 주제로 문제 풀을 좁힌다.
 *
 * 빈 배열은 "전체"다. 그리고 **걸러낸 결과가 비면 원본을 돌려준다** —
 * 주제를 골랐다는 이유로 라운드가 시작되지 않는 쪽이 훨씬 나쁘다.
 */
export function filterByTopics<T extends Topical>(
  items: readonly T[],
  topics: readonly TopicId[],
): readonly T[] {
  if (topics.length === 0 || items.length === 0) return items
  const picked = items.filter((item) => topics.includes(item.topic))
  return picked.length > 0 ? picked : items
}
