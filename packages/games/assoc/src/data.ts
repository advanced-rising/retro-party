import type { NonEmptyArray } from '@retro/room-kit'

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
  readonly word: string
  readonly category: string
  /** 사전에 등록된 다른 정답 */
  readonly aliases: readonly string[]
  /** 출제자가 쓸 수 없는 말. 코드가 자동 확장한다 (02 문서 §3.4) */
  readonly banned: readonly string[]
  /** 혼자 모드에서 시간에 따라 흘릴 설명 3단계 */
  readonly script: readonly [string, string, string]
}

export const SAMPLE_WORDS: NonEmptyArray<AssocWord> = [
  {
    word: '삐삐',
    category: '90년대 물건',
    aliases: ['무선호출기', '페이저'],
    banned: ['beeper', 'pager'],
    script: [
      '허리에 차고 다니던 물건이에요',
      '숫자로 메시지를 보냈어요',
      '8282 같은 숫자 암호가 있었죠',
    ],
  },
  {
    word: '오락실',
    category: '그때 그 장소',
    aliases: ['게임장'],
    banned: [],
    script: [
      '동전을 잔뜩 바꿔서 갔어요',
      '기계 위에 동전을 쌓아두고 줄을 섰죠',
      '학교 끝나고 가면 엄마한테 혼났어요',
    ],
  },
  {
    word: '다마고치',
    category: '90년대 물건',
    aliases: [],
    banned: ['tamagotchi'],
    script: [
      '손바닥만 한 계란 모양이었어요',
      '밥을 안 주면 죽었어요',
      '수업 시간에 몰래 눌렀죠',
    ],
  },
  {
    word: '롤라장',
    category: '그때 그 장소',
    aliases: ['롤러장'],
    banned: [],
    script: [
      '바퀴 달린 신발을 빌려 신었어요',
      '가운데서 넘어지면 창피했죠',
      '음악이 크게 나오던 실내 공간이에요',
    ],
  },
  {
    word: '브로마이드',
    category: '90년대 물건',
    aliases: [],
    banned: [],
    script: [
      '벽에 붙이는 물건이에요',
      '좋아하는 가수가 크게 인쇄돼 있었죠',
      '잡지 부록으로 자주 들어 있었어요',
    ],
  },
  {
    word: '공중전화',
    category: '90년대 물건',
    aliases: [],
    banned: [],
    script: [
      '길거리에 부스가 있었어요',
      '카드나 동전을 넣고 썼죠',
      '뒤에 줄이 길면 눈치가 보였어요',
    ],
  },
  {
    word: '만화방',
    category: '그때 그 장소',
    aliases: ['만화가게'],
    banned: [],
    script: [
      '앉아서 몇 시간이고 있었어요',
      '라면도 팔았죠',
      '한 권씩 빌려서 쌓아놓고 봤어요',
    ],
  },
  {
    word: '워크맨',
    category: '90년대 물건',
    aliases: [],
    banned: ['walkman'],
    script: [
      '주머니에 넣고 다녔어요',
      '테이프를 넣고 이어폰을 꽂았죠',
      '늘어지면 연필로 감았어요',
    ],
  },
  {
    word: '비디오가게',
    category: '그때 그 장소',
    aliases: ['비디오대여점'],
    banned: [],
    script: [
      '주말 저녁에 온 가족이 갔어요',
      '테이프를 빌려서 봤죠',
      '늦게 반납하면 연체료를 냈어요',
    ],
  },
  {
    word: '쌍쌍바',
    category: '그때 그 과자',
    aliases: [],
    banned: [],
    script: [
      '여름에 먹던 거예요',
      '둘이 나눠 먹으라고 만든 모양이었죠',
      '반으로 쪼갤 때 한쪽이 꼭 작게 갈라졌어요',
    ],
  },
]
