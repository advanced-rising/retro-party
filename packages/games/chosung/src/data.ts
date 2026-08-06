import type { NonEmptyArray } from '@retro/room-kit'

/**
 * 초성 퀴즈 문제 풀 — Phase 0.5 검증용 샘플.
 *
 * 정식 콘텐츠는 04 문서의 파이프라인으로 1,500개를 만들어 KV 에 넣고,
 * 방 생성 시 한 번 읽어 DO 메모리에 들고 있는다 (05 문서 §5).
 * 여기 있는 것은 뼈대가 도는지 확인하기 위한 최소 세트다.
 */

export interface ChosungWord {
  readonly word: string
  readonly category: string
  /** 8초에 공개되는 설명 한 줄 */
  readonly hint: string
  /** 사전에 등록된 다른 정답. 복수 정답 허용 — 02 문서 §2.3 */
  readonly aliases: readonly string[]
}

export const SAMPLE_WORDS: NonEmptyArray<ChosungWord> = [
  { word: '삐삐', category: '90년대 물건', hint: '허리에 차고 다녔다', aliases: ['무선호출기'] },
  { word: '워크맨', category: '90년대 물건', hint: '테이프를 넣고 들었다', aliases: [] },
  { word: '다마고치', category: '90년대 물건', hint: '밥 안 주면 죽었다', aliases: [] },
  { word: '브로마이드', category: '90년대 물건', hint: '벽에 붙이던 대형 사진', aliases: [] },
  { word: '시티폰', category: '90년대 물건', hint: '발신만 되던 전화', aliases: [] },
  { word: '공중전화', category: '90년대 물건', hint: '카드나 동전을 넣었다', aliases: [] },
  { word: '카세트테이프', category: '90년대 물건', hint: '연필로 감았다', aliases: ['카세트'] },
  { word: '플로피디스켓', category: '90년대 물건', hint: '1.44MB 였다', aliases: ['디스켓'] },

  { word: '죠스바', category: '그때 그 과자', hint: '혀가 파래졌다', aliases: [] },
  { word: '쌍쌍바', category: '그때 그 과자', hint: '반으로 쪼개 나눠 먹었다', aliases: [] },
  { word: '뽀빠이', category: '그때 그 과자', hint: '별사탕이 들어 있었다', aliases: [] },
  { word: '새우깡', category: '그때 그 과자', hint: '손이 가요 손이 가', aliases: [] },
  { word: '자야', category: '그때 그 과자', hint: '땅콩이 박힌 과자', aliases: [] },

  { word: '오락실', category: '그때 그 장소', hint: '동전을 쌓아두고 줄을 섰다', aliases: [] },
  { word: '만화방', category: '그때 그 장소', hint: '라면도 팔았다', aliases: ['만화가게'] },
  { word: '비디오가게', category: '그때 그 장소', hint: '연체료가 무서웠다', aliases: ['비디오대여점'] },
  { word: '롤라장', category: '그때 그 장소', hint: '바퀴 달린 신발을 빌렸다', aliases: ['롤러장'] },
  { word: '피시방', category: '그때 그 장소', hint: '시간당 천 원이었다', aliases: ['PC방'] },

  { word: '스타크래프트', category: '그때 그 게임', hint: '저글링 러시', aliases: ['스타'] },
  { word: '바람의나라', category: '그때 그 게임', hint: '국내 최초 그래픽 머드', aliases: [] },
  { word: '크레이지아케이드', category: '그때 그 게임', hint: '물풍선을 터뜨렸다', aliases: ['크아'] },
  { word: '테트리스', category: '그때 그 게임', hint: '한 줄씩 지웠다', aliases: [] },

  { word: '모래시계', category: '그때 그 방송', hint: '나 지금 떨고 있니', aliases: [] },
  { word: '순풍산부인과', category: '그때 그 방송', hint: '미달이가 나왔다', aliases: ['순풍'] },
  { word: '아빠와크레파스', category: '그때 그 방송', hint: '동요 프로그램', aliases: [] },

  { word: '야타족', category: '그때 그 유행어', hint: '차에 타라고 불렀다', aliases: [] },
  { word: '오빠믿지', category: '그때 그 유행어', hint: '믿으면 안 됐다', aliases: [] },
  { word: '삐삐번호', category: '그때 그 유행어', hint: '8282 는 빨리빨리', aliases: [] },
]
