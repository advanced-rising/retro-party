import { asGameId, filterByTopics } from '@retro/types'
import {
  escalatingPenalty,
  roundScore,
  wrongCount,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ViewInput,
} from '@retro/room-kit'
import { SAMPLE_SETS, type TimelineEvent, type TimelineSet } from './data.ts'

/**
 * 연표 정렬 — 사건 다섯 개를 시간순으로 늘어놓는다.
 *
 * 다른 게임과 다른 점: **답이 하나의 단어가 아니라 순서**다.
 * 그래서 화면이 드래그로 카드를 옮기고, 채팅으로는 그 순서를 보낸다
 * (`13245` 또는 `1 3 2 4 5`). 채팅이 입력이라는 원칙은 그대로 지킨다.
 *
 * **근사치를 인정한다.** 다섯 개를 완벽히 맞추는 건 너무 가혹해서,
 * 인접한 쌍이 얼마나 제 순서인지로 점수를 나눈다 — 거의 맞췄으면 그만큼 준다.
 */

export const ROUND_MS = 50_000

/** 이 비율 이상 맞으면 부분 점수 */
export const NEAR_RATIO = 0.6
const NEAR_POINTS = 40

/** 순서를 고쳐서 다시 내는 게 정상인 게임이라 넉넉히 봐준다 */
const PENALTY = { free: 3, step: 10, max: 40 } as const

export interface TimelineQuestion {
  readonly title: string
  /** 섞인 순서 그대로. 화면에 이 순서로 나온다 */
  readonly events: readonly TimelineEvent[]
  /** 정답 순서 — events 인덱스를 시간순으로 나열한 것 */
  readonly order: readonly number[]
}

export interface TimelineView {
  readonly title: string
  /** 연도 없이 사건 문장만. 정답인 연도는 담기지 않는다 */
  readonly events: readonly string[]
  readonly solvedCount: number
  readonly youSolved: boolean
}

/**
 * 채팅에서 순서를 읽는다. `13245` 도 `1 3 2 4 5` 도 받는다.
 * 1-based 로 받아 0-based 로 돌려준다.
 */
export function parseOrder(text: string, count: number): readonly number[] | null {
  const digits = [...text.trim()].filter((ch) => /\d/u.test(ch)).map(Number)
  if (digits.length !== count) return null
  if (digits.some((d) => d < 1 || d > count)) return null
  if (new Set(digits).size !== count) return null
  return digits.map((d) => d - 1)
}

/**
 * 얼마나 맞았는가 (0~1).
 *
 * 인접한 쌍이 제 순서인지로 센다. 자리를 정확히 맞췄는지로 세면
 * 한 칸만 밀려도 전부 틀린 게 되는데, 그건 실제 실력과 안 맞는다.
 * **같은 해 사건은 어느 쪽이 먼저든 맞은 것으로 친다.**
 */
export function orderAccuracy(
  guess: readonly number[],
  years: readonly number[],
): number {
  if (guess.length < 2) return 1
  let ok = 0
  for (let i = 0; i < guess.length - 1; i++) {
    const a = years[guess[i] ?? 0] ?? 0
    const b = years[guess[i + 1] ?? 0] ?? 0
    if (a <= b) ok += 1
  }
  return ok / (guess.length - 1)
}

function buildQuestion(set: TimelineSet, shuffle: (xs: readonly number[]) => number[]): TimelineQuestion {
  const indices = shuffle(set.events.map((_, i) => i))
  const events = indices.map((i) => set.events[i] as TimelineEvent)
  const order = events
    .map((event, i) => ({ i, year: event.year }))
    .sort((a, b) => a.year - b.year)
    .map((e) => e.i)
  return { title: set.title, events, order }
}

export const timelineGame: RoomGame<TimelineQuestion, TimelineView> = {
  id: asGameId('timeline'),

  meta: {
    name: '연표 정렬',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): TimelineQuestion {
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly TimelineSet[]) : SAMPLE_SETS
    const picked = filterByTopics(source, input.topics)
    const set = picked[input.rng.int(picked.length)] ?? SAMPLE_SETS[0]
    return buildQuestion(set, (xs) => input.rng.shuffle(xs))
  },

  judge(input: JudgeInput<TimelineQuestion>): Judgement {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = parseOrder(input.text, input.question.events.length)
    // 순서 형태가 아니면 잡담이다
    if (guess === null) return { kind: 'ignored' }

    const years = input.question.events.map((e) => e.year)
    const accuracy = orderAccuracy(guess, years)

    if (accuracy >= 1) {
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
    }

    // 근사치 — 거의 맞췄으면 한 번은 인정한다
    if (accuracy >= NEAR_RATIO && !input.round.partials.includes(input.playerId)) {
      return {
        kind: 'partial',
        points: Math.round(NEAR_POINTS * accuracy),
        note: `${Math.round(accuracy * 100)}% 맞았어요`,
      }
    }

    return {
      kind: 'wrong',
      note: `${Math.round(accuracy * 100)}% 맞았어요`,
      penalty: escalatingPenalty(wrongCount(input.round, input.playerId), PENALTY),
    }
  },

  isRoundOver(_question: TimelineQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: TimelineQuestion): RevealData {
    const sorted = [...question.events].sort((a, b) => a.year - b.year)
    return {
      answer: sorted.map((e) => e.year).join(' → '),
      detail: {
        title: question.title,
        ordered: sorted.map((e) => ({ year: e.year, text: e.text })),
      },
    }
  },

  /** ★ 연도를 담지 않는다. 연도가 보이면 정렬할 이유가 없다 */
  viewFor(input: ViewInput<TimelineQuestion>): TimelineView {
    return {
      title: input.question.title,
      events: input.question.events.map((e) => e.text),
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },
}

export { SAMPLE_SETS, type TimelineEvent, type TimelineSet } from './data.ts'
