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
import { SAMPLE_PRICES, type PriceEntry } from './data.ts'

/**
 * 그때 그 가격 — "1997년 자장면은 얼마였을까요?"
 *
 * 「그 해」가 연도를 맞히는 게임이라면 이건 **가격**을 맞힌다.
 * 정확히 맞히는 건 거의 불가능하므로 판정이 다르다.
 *
 *   · 오차 5% 이내  → 정답
 *   · 오차 20% 이내 → 부분 점수 (1인 1회)
 *   · 그 외         → 오답이지만 **"더 비싸요 / 더 싸요"** 를 돌려준다
 *
 * 마지막 한 줄이 이 게임의 전부다. 방향을 알려주니까 사람들이 계속 외치고,
 * 그래서 채팅이 죽지 않는다. 방향만 주고 자릿수는 절대 알려주지 않는다.
 */

export const ROUND_MS = 40_000

/** 이 안에 들면 정답 */
export const EXACT_BAND = 0.05
/** 여기까지는 아깝다 */
export const NEAR_BAND = 0.2
const NEAR_POINTS = 30

/** 힌트가 열리는 시각 — 자릿수를 알려준다 */
const DIGITS_AT_MS = 20_000

export interface MulgaQuestion {
  readonly item: string
  readonly year: number
  readonly price: number
  readonly unit: string
  readonly note: string
}

export interface MulgaView {
  readonly item: string
  readonly year: number
  readonly unit: string
  readonly note: string
  /** 20초가 지나면 자릿수만 알려준다. 그 전에는 null */
  readonly digits: number | null
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly usedNear: boolean
}

/**
 * 채팅에서 금액을 읽는다. `2500` `2,500` `2500원` `2천5백` 은 안 받고
 * 숫자와 쉼표·원 만 받는다 — 채팅으로 빨리 치는 형태다.
 */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim().replace(/\s+/g, '')
  const match = /^([\d,]+)원?$/.exec(trimmed)
  if (match === null) return null

  const digits = (match[1] ?? '').replace(/,/g, '')
  if (digits.length === 0 || digits.length > 9) return null

  const value = Number(digits)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** 상대 오차. 0 이면 완전 일치 */
export function errorRatio(guess: number, actual: number): number {
  if (actual <= 0) return Infinity
  return Math.abs(guess - actual) / actual
}

function buildQuestion(entry: PriceEntry): MulgaQuestion {
  return {
    item: entry.item,
    year: entry.year,
    price: entry.price,
    unit: entry.unit,
    note: entry.note,
  }
}

export const mulgaGame: RoomGame<MulgaQuestion, MulgaView> = {
  id: asGameId('mulga'),

  meta: {
    name: '그때 그 가격',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): MulgaQuestion {
    // 콘텐츠 풀이 비어 있으면 샘플로 떨어진다. 그 다음 고른 주제로 좁힌다
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly PriceEntry[]) : SAMPLE_PRICES
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_PRICES[0]
    return buildQuestion(entry)
  },

  judge(input: JudgeInput<MulgaQuestion>): Judgement {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = parsePrice(input.text)
    // 숫자가 아니면 잡담이다. 판정하지 않는다
    if (guess === null) return { kind: 'ignored' }

    const actual = input.question.price
    const error = errorRatio(guess, actual)
    // ★ 방향만 알려준다. 얼마나 차이 나는지는 절대 말하지 않는다
    const direction = guess < actual ? '더 비싸요' : '더 싸요'

    if (error <= EXACT_BAND) {
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

    if (error <= NEAR_BAND && !input.round.partials.includes(input.playerId)) {
      return { kind: 'partial', points: NEAR_POINTS, note: `아깝다 — ${direction}` }
    }

    return { kind: 'wrong', note: direction }
  },

  isRoundOver(_question: MulgaQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: MulgaQuestion): RevealData {
    return {
      answer: `${question.price.toLocaleString('ko-KR')}${question.unit}`,
      detail: { item: question.item, year: question.year, note: question.note },
    }
  },

  nextRevealAtMs(_question, round, nowMs): number | null {
    const at = round.startedAtMs + DIGITS_AT_MS
    return nowMs < at ? at : null
  },

  /** ★ 정답 누출 방지. price 를 담지 않는다. 자릿수도 20초 뒤에야 나간다 */
  viewFor(input: ViewInput<MulgaQuestion>): MulgaView {
    const elapsedMs = input.nowMs - input.round.startedAtMs
    return {
      item: input.question.item,
      year: input.question.year,
      unit: input.question.unit,
      note: input.question.note,
      digits: elapsedMs >= DIGITS_AT_MS ? String(input.question.price).length : null,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
      usedNear: input.round.partials.includes(input.playerId),
    }
  },
}

export { SAMPLE_PRICES, type PriceEntry } from './data.ts'
