import { asGameId, filterByTopics } from '@retro/types'
import {
  roundScore,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ViewInput,
} from '@retro/room-kit'
import { SAMPLE_QUESTIONS, type OxQuestion as OxEntry } from './data.ts'

/**
 * 스피드 OX — 이 묶음에서 라운드가 가장 짧다.
 *
 * 10초. 생각할 시간을 주지 않는 게 목적이다. 다른 게임이 「떠올리기」라면
 * 이건 「판단하기」라서, 방의 리듬을 바꾸는 역할을 한다.
 *
 * 답은 O / X 두 글자뿐이라 채팅으로 치기도 쉽다 — 버튼은 편의다.
 */

export const ROUND_MS = 10_000

/** 한 번 답하면 끝이다. 바꿔 찍기를 막는다 */
export interface OxQuestion {
  readonly text: string
  readonly answer: boolean
}

export interface OxView {
  readonly text: string
  readonly solvedCount: number
  readonly youSolved: boolean
  /** 이미 답했는가 (맞았든 틀렸든) */
  readonly youAnswered: boolean
}

/** `O` `o` `ㅇ` `맞아` 를 O 로, `X` `x` `ㅌ` `아니` 를 X 로 읽는다 */
export function parseOx(text: string): boolean | null {
  const t = text.trim().toLowerCase().replace(/\s+/gu, '')
  if (t.length === 0 || t.length > 4) return null
  if (['o', '0', 'ㅇ', '오', '맞아', '맞음', '예', 'ㅇㅇ'].includes(t)) return true
  if (['x', 'ㅌ', 'ㅋ', '엑스', '아니', '아님', '틀림', 'ㄴㄴ'].includes(t)) return false
  return null
}

export const oxquizGame: RoomGame<OxQuestion, OxView> = {
  id: asGameId('oxquiz'),

  meta: {
    name: '스피드 OX',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): OxQuestion {
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly OxEntry[]) : SAMPLE_QUESTIONS
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_QUESTIONS[0]
    return { text: entry.text, answer: entry.answer }
  },

  judge(input: JudgeInput<OxQuestion>): Judgement {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }
    // 한 번 틀리면 그 라운드는 끝. 안 그러면 O 치고 X 치면 반드시 맞는다
    if (input.round.partials.includes(input.playerId)) return { kind: 'ignored' }

    const guess = parseOx(input.text)
    if (guess === null) return { kind: 'ignored' }

    if (guess !== input.question.answer) {
      // partials 에 남겨서 두 번째 시도를 막는다
      return { kind: 'partial', points: 0, note: '땡' }
    }

    const rank = input.round.solved.length
    return {
      kind: 'correct',
      rank,
      points: roundScore({
        rank,
        elapsedMs: input.atMs - input.round.startedAtMs,
        roundMs: ROUND_MS,
      }),
    }
  },

  isRoundOver(_question: OxQuestion, round: RoundState): boolean {
    // 맞힌 사람 + 틀린 사람이 전부 나오면 더 기다릴 이유가 없다
    const done = new Set([...round.solved, ...round.partials])
    return done.size > 0 && done.size >= round.expectedSolvers
  },

  reveal(question: OxQuestion): RevealData {
    return { answer: question.answer ? 'O' : 'X', detail: { text: question.text } }
  },

  /** ★ answer 를 담지 않는다 */
  viewFor(input: ViewInput<OxQuestion>): OxView {
    return {
      text: input.question.text,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
      youAnswered:
        input.round.solved.includes(input.playerId) ||
        input.round.partials.includes(input.playerId),
    }
  },
}

export { SAMPLE_QUESTIONS } from './data.ts'
export type { OxQuestion as OxEntry } from './data.ts'
