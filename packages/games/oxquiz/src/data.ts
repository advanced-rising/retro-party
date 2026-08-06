import type { TopicId } from '@retro/types'
import type { NonEmptyArray } from '@retro/room-kit'

/**
 * 스피드 OX 문항.
 *
 * **틀린 문장을 일부러 섞는다.** 전부 맞는 말이면 O 만 눌러도 이겨서
 * 게임이 성립하지 않는다. 대략 3분의 1을 X 로 둔다.
 *
 * 틀린 문장도 **사실에 근거해서** 만든다 — 연도를 한두 해 비틀거나
 * 숫자를 바꾸는 식이다. 아무렇게나 지어내면 검증할 수가 없다.
 */

export interface OxQuestion {
  readonly text: string
  readonly topic: TopicId
  /** true 면 O, false 면 X */
  readonly answer: boolean
}

export const SAMPLE_QUESTIONS: NonEmptyArray<OxQuestion> = [
  { text: '삐삐는 문자를 보낼 수 있었다', topic: 'daily', answer: false },
  { text: '공중전화는 카드로도 쓸 수 있었다', topic: 'daily', answer: true },
  { text: '워크맨은 카세트테이프를 넣어 들었다', topic: 'daily', answer: true },
  { text: '다마고치는 밥을 안 주면 죽었다', topic: 'daily', answer: true },
  { text: '플로피디스켓 용량은 기가바이트 단위였다', topic: 'daily', answer: false },
  { text: '버스토큰은 문방구에서도 팔았다', topic: 'daily', answer: true },
  { text: '오락실 한 판은 보통 천 원이었다', topic: 'daily', answer: false },
  { text: '연탄에는 구멍이 뚫려 있다', topic: 'daily', answer: true },
  { text: '가요톱텐에서 5주 연속 1위를 하면 골든컵을 받았다', topic: 'culture', answer: true },
  { text: '전국노래자랑은 라디오 프로그램으로 시작했다', topic: 'culture', answer: false },
  { text: '브로마이드는 잡지 부록으로 자주 들어 있었다', topic: 'culture', answer: true },
  { text: '드라마 모래시계는 1990년대에 방영됐다', topic: 'drama', answer: true },
  { text: '드라마 대장금은 궁중 요리를 다뤘다', topic: 'drama', answer: true },
  { text: '전원일기는 10년 미만 방영됐다', topic: 'drama', answer: false },
  { text: '영화 쉬리는 한국 영화 흥행 기록을 새로 썼다', topic: 'movie', answer: true },
  { text: '영화 기생충은 아카데미 작품상을 받았다', topic: 'movie', answer: true },
  { text: '영화 실미도는 천만 관객을 넘긴 첫 한국 영화다', topic: 'movie', answer: true },
  { text: '슬램덩크는 야구 만화다', topic: 'anime-jp', answer: false },
  { text: '명탐정 코난의 주인공은 몸이 작아졌다', topic: 'anime-jp', answer: true },
  { text: '드래곤볼에서 구슬을 모으면 소원이 이뤄진다', topic: 'anime-jp', answer: true },
  { text: '아기공룡 둘리는 빙하를 타고 왔다', topic: 'anime-kr', answer: true },
  { text: '검정고무신은 형제 이야기다', topic: 'anime-kr', answer: true },
  { text: '로보트 태권브이는 일본 작품이다', topic: 'anime-kr', answer: false },
  { text: '서태지와 아이들은 1992년에 데뷔했다', topic: 'music', answer: true },
  { text: 'H.O.T의 응원 풍선은 노란색이었다', topic: 'music', answer: false },
  { text: '싸이는 말춤으로 세계적 인기를 얻었다', topic: 'music', answer: true },
  { text: '스타크래프트의 종족은 넷이다', topic: 'game', answer: false },
  { text: '바람의나라는 국내 최초 그래픽 머드 게임이다', topic: 'game', answer: true },
  { text: '테트리스에서 한 줄을 채우면 사라진다', topic: 'game', answer: true },
  { text: '리니지에는 공성전이 있다', topic: 'game', answer: true },
  { text: '하이텔은 전화선으로 접속했다', topic: 'it', answer: true },
  { text: 'PC통신을 쓰는 동안에도 집 전화를 쓸 수 있었다', topic: 'it', answer: false },
  { text: '싸이월드에서 배경음악을 사려면 도토리가 필요했다', topic: 'it', answer: true },
  { text: '카카오톡은 2010년에 출시됐다', topic: 'it', answer: true },
  { text: '1997년 한국은 IMF에 구제금융을 요청했다', topic: 'economy', answer: true },
  { text: '금 모으기 운동은 1998년에 벌어졌다', topic: 'economy', answer: true },
  { text: '외환위기 때 환율은 내려갔다', topic: 'economy', answer: false },
  { text: '최저임금은 법으로 정해진다', topic: 'economy', answer: true },
  { text: '국민학교라는 이름은 1996년에 초등학교로 바뀌었다', topic: 'society', answer: true },
  { text: '수능은 1994년에 처음 치러졌다', topic: 'society', answer: true },
  { text: '성수대교는 1994년에 무너졌다', topic: 'society', answer: true },
  { text: '삼풍백화점은 1996년에 무너졌다', topic: 'society', answer: false },
  { text: '주 5일제 도입으로 토요일에도 학교에 가게 됐다', topic: 'society', answer: false },
  { text: '훈민정음은 세종이 반포했다', topic: 'history', answer: true },
  { text: '임진왜란은 1592년에 시작됐다', topic: 'history', answer: true },
  { text: '거북선은 이순신이 이끌었다', topic: 'history', answer: true },
  { text: '삼일운동은 1919년에 일어났다', topic: 'history', answer: true },
  { text: '경부고속도로는 1980년대에 개통했다', topic: 'history', answer: false },
  { text: '한국전쟁은 1950년에 일어났다', topic: 'history', answer: true },
  { text: '베를린 장벽은 1989년에 무너졌다', topic: 'world', answer: true },
  { text: '인류가 달에 착륙한 것은 1969년이다', topic: 'world', answer: true },
  { text: '제1차 세계대전은 1939년에 시작됐다', topic: 'world', answer: false },
  { text: '프랑스혁명은 바스티유 감옥 습격으로 시작됐다', topic: 'world', answer: true },
  { text: '콜럼버스가 항해에 나선 해는 1492년이다', topic: 'world', answer: true },
  { text: '2002년 월드컵은 한국과 일본이 함께 열었다', topic: 'football', answer: true },
  { text: '한국은 2002년 월드컵에서 8강까지 올랐다', topic: 'football', answer: false },
  { text: '축구에서 골키퍼만 손을 쓸 수 있다', topic: 'football', answer: true },
  { text: '한 경기에서 세 골을 넣으면 해트트릭이다', topic: 'football', answer: true },
  { text: '박찬호는 한국인 최초 메이저리거다', topic: 'baseball', answer: true },
  { text: '만루홈런은 한 번에 3점이다', topic: 'baseball', answer: false },
  { text: '한국시리즈는 7전 4선승제다', topic: 'baseball', answer: true },
  { text: '완봉승은 한 점도 주지 않고 이긴 것이다', topic: 'baseball', answer: true },
  { text: '농구에서 자유투는 한 골에 1점이다', topic: 'basketball', answer: true },
  { text: '삼점슛은 아크 안쪽에서 넣는 것이다', topic: 'basketball', answer: false },
  { text: 'NBA는 미국 프로 농구 리그다', topic: 'basketball', answer: true },
  { text: '올림픽은 4년마다 열린다', topic: 'sports', answer: true },
  { text: '서울 올림픽은 1988년에 열렸다', topic: 'sports', answer: true },
  { text: '평창 동계올림픽은 2018년에 열렸다', topic: 'sports', answer: true },
  { text: '마라톤 거리는 42.195km 다', topic: 'sports', answer: true },
  { text: '김연아는 피겨스케이팅 선수다', topic: 'sports', answer: true },
]
