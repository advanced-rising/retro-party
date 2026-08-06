import type { GameId, PlayerId, Seed, TeamId, TopicId } from '@retro/types'
import type { Rng } from './rng.ts'

/**
 * 게임 모듈 인터페이스 — 01 문서 §9
 *
 * 구현체는 전부 순수 함수여야 한다.
 *   · Date.now() / Math.random() 금지 — 시간은 인자로, 난수는 Rng 로 주입받는다
 *   · WebSocket · Durable Object 를 몰라야 한다
 *   · viewFor 가 정답을 흘리면 게임이 성립하지 않는다 (테스트 필수)
 */
export interface RoomGame<Question, View> {
  readonly id: GameId
  readonly meta: GameMeta

  createRound(input: CreateRoundInput): Question
  judge(input: JudgeInput<Question>): Judgement
  isRoundOver(question: Question, round: RoundState): boolean
  reveal(question: Question): RevealData
  /** ★ 참가자별 뷰. 정답 누출을 막는 유일한 통로 */
  viewFor(input: ViewInput<Question>): View

  /**
   * 이 사람이 이번 라운드에 쓸 수 없는 말 (단어 연상의 출제자) — 02 문서 §3.4
   *
   * **사람마다 다르다.** 출제자는 정답을 말하면 안 되지만, 맞히는 사람은
   * 정답을 쳐야 이긴다. 전원에게 같은 금칙어를 걸면 게임이 성립하지 않는다.
   */
  blockedWordsFor?(input: BlockedWordsInput<Question>): readonly string[]

  /**
   * 다음에 무언가 열리는 **절대 시각**. 더 열릴 게 없으면 null.
   *
   * 「힌트 먼저 보기」 투표가 이걸 쓴다. 게임마다 힌트 규칙이 달라서
   * 엔진이 직접 알 수 없다 — 게임이 알려주면 엔진은 라운드 시계를
   * 그 시각까지 앞당긴다. 그러면 힌트도 열리고 남은 시간도 같이 줄어든다.
   */
  nextRevealAtMs?(question: Question, round: RoundState, nowMs: number): number | null

  /**
   * 정답이 나온 뒤 **문제 자체가 달라지는 게임** (쿵쿵따의 단어 사슬).
   *
   * 반환하면 엔진이 그 문제로 갈아끼운다. 대부분의 게임은 한 라운드에
   * 문제가 하나라 이걸 구현하지 않는다.
   */
  advance?(question: Question, input: JudgeInput<Question>): Question

  /**
   * 라운드가 끝날 때 얹는 점수 (단어 연상의 출제자 보너스) — 02 문서 §3.5
   * 맞힌 사람 수에 연동되므로 라운드가 끝나야 계산할 수 있다.
   */
  roundEndBonus?(question: Question, round: RoundState): readonly ScoreDelta[]
}

export interface BlockedWordsInput<Question> {
  readonly question: Question
  readonly round: RoundState
  readonly playerId: PlayerId
}

export type ScoreDelta = readonly [PlayerId, number]

export interface GameMeta {
  readonly name: string
  readonly minPlayers: number
  readonly maxPlayers: number
  readonly roundMs: number
  /** 단어 연상처럼 출제자가 필요한 게임 */
  readonly hasPresenter: boolean
}

export interface CreateRoundInput {
  readonly seed: Seed
  readonly roundNo: number
  readonly rng: Rng
  readonly pool: ContentPool
  /** 방에서 고른 주제. 비어 있으면 전체 — filterByTopics 를 그대로 쓰면 된다 */
  readonly topics: readonly TopicId[]
  /** 출제자가 있는 게임에서만. 없으면 null */
  readonly presenter: PlayerId | null
}

/** 방 생성 시 KV 에서 한 번 읽어 DO 메모리에 들고 있는다 — 05 문서 §5 */
export interface ContentPool {
  readonly version: string
  readonly items: readonly unknown[]
}

export interface JudgeInput<Question> {
  readonly question: Question
  readonly round: RoundState
  readonly playerId: PlayerId
  /** 채팅 원문. 정답 입력이 곧 채팅이다 */
  readonly text: string
  readonly atMs: number
}

export type Judgement =
  /** 정답 후보가 아닌 잡담. 채팅에는 그대로 흐른다 */
  | { readonly kind: 'ignored' }
  | { readonly kind: 'wrong'; readonly note?: string }
  | { readonly kind: 'partial'; readonly points: number; readonly note?: string }
  | { readonly kind: 'correct'; readonly points: number; readonly rank: number }

/**
 * 판정에 붙는 한 줄 (`note`) — 「그때 그 가격」의 "더 비싸요" 같은 것.
 *
 * 이게 없으면 근접 판정 게임이 성립하지 않는다. 틀렸다는 사실만으로는
 * 다음에 뭘 쳐야 할지 알 수 없어서 채팅이 죽는다.
 * **정답을 유추할 수 있는 값을 담지 않는다** — 방향만 알려준다.
 */

export interface RoundState {
  readonly roundNo: number
  readonly startedAtMs: number
  readonly endsAtMs: number
  /** 이미 맞힌 참가자. 순서가 곧 순위 */
  readonly solved: readonly PlayerId[]
  /** 부분 점수를 이미 받은 참가자. 「그 해」의 ±1년은 1회만 — 02 문서 §1.3 */
  readonly partials: readonly PlayerId[]
  readonly presenter: PlayerId | null
  /** 맞힐 수 있는 참가자 수 (출제자 제외). 전원 정답 시 조기 종료 판정에 쓴다 */
  readonly expectedSolvers: number
}

export interface RevealData {
  readonly answer: string
  /** 정산 화면에 띄울 부가 정보 (「그 해」 카드 등) */
  readonly detail: unknown
}

export interface ViewInput<Question> {
  readonly question: Question
  readonly round: RoundState
  readonly playerId: PlayerId
  readonly team: TeamId | null
  readonly nowMs: number
}

export interface EmptyRoundInput {
  readonly roundNo: number
  readonly startedAtMs: number
  readonly roundMs: number
  readonly expectedSolvers: number
  readonly presenter: PlayerId | null
}

export function emptyRound(input: EmptyRoundInput): RoundState {
  return {
    roundNo: input.roundNo,
    startedAtMs: input.startedAtMs,
    endsAtMs: input.startedAtMs + input.roundMs,
    solved: [],
    partials: [],
    presenter: input.presenter,
    expectedSolvers: input.expectedSolvers,
  }
}
