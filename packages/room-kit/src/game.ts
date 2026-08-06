import type { GameId, PlayerId, Seed, TeamId } from '@retro/types'
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
}

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
  | { readonly kind: 'wrong' }
  | { readonly kind: 'partial'; readonly points: number }
  | { readonly kind: 'correct'; readonly points: number; readonly rank: number }

export interface RoundState {
  readonly roundNo: number
  readonly startedAtMs: number
  readonly endsAtMs: number
  /** 이미 맞힌 참가자. 순서가 곧 순위 */
  readonly solved: readonly PlayerId[]
  readonly presenter: PlayerId | null
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

export function emptyRound(roundNo: number, startedAtMs: number, roundMs: number): RoundState {
  return {
    roundNo,
    startedAtMs,
    endsAtMs: startedAtMs + roundMs,
    solved: [],
    presenter: null,
  }
}
