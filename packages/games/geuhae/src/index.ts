import { asGameId } from '@retro/types'
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
import { SAMPLE_YEARS, type YearCard, type YearEntry } from './data.ts'

/**
 * 그 해 — 02 문서 §1
 *
 * 60초. 8초마다 힌트가 하나씩 열린다. 어려운 것부터 쉬운 것 순서라
 * 일찍 맞힐수록 점수가 높다. 채팅으로 연도를 외친다.
 */

export const ROUND_MS = 60_000
export const HINT_INTERVAL_MS = 8_000
export const MAX_HINTS = 6

/** ±1년은 이만큼. 한 사람당 한 번만 — 02 문서 §1.3 */
const NEAR_POINTS = 30

/** 힌트가 적게 열렸을 때 맞히면 가산. 힌트 1개 = 1.75배, 전부 = 1.0배 */
const EARLY_BONUS_PER_HINT = 0.15

export const YEAR_MIN = 1980
export const YEAR_MAX = 2020

/** 서버만 보유한다 */
export interface GeuhaeQuestion {
  readonly year: number
  readonly hints: readonly string[]
  readonly card: YearCard
}

/** 클라이언트가 받는 것. year 가 없다 */
export interface GeuhaeView {
  /** 지금까지 열린 힌트만 */
  readonly hints: readonly string[]
  readonly totalHints: number
  /** 다음 힌트까지 남은 ms. 더 열릴 게 없으면 null */
  readonly nextHintInMs: number | null
  readonly solvedCount: number
  readonly youSolved: boolean
  /** 이미 ±1년 점수를 받았는가. 받았으면 더 안 준다 */
  readonly usedNear: boolean
}

export function openHintCount(elapsedMs: number): number {
  if (elapsedMs < 0) return 1
  return Math.min(MAX_HINTS, Math.floor(elapsedMs / HINT_INTERVAL_MS) + 1)
}

/**
 * 채팅에서 연도를 읽는다. `1997` `1997년` `97` `97년` 을 전부 받는다.
 * 채팅으로 빨리 치려면 두 자리가 자연스럽다 — 02 문서 §1.3
 */
export function parseYear(text: string): number | null {
  const trimmed = text.trim().replace(/\s+/g, '')
  const match = /^(\d{2}|\d{4})년?$/.exec(trimmed)
  if (match === null) return null

  const digits = match[1]
  if (digits === undefined) return null
  const value = Number(digits)

  if (digits.length === 4) return value
  // 두 자리 — 80~99 는 1900년대, 00~20 은 2000년대
  if (value >= 80) return 1900 + value
  if (value <= YEAR_MAX - 2000) return 2000 + value
  return null
}

function buildQuestion(entry: YearEntry): GeuhaeQuestion {
  return {
    year: entry.year,
    hints: entry.hints.slice(0, MAX_HINTS),
    card: entry.card,
  }
}

export const geuhaeGame: RoomGame<GeuhaeQuestion, GeuhaeView> = {
  id: asGameId('geuhae'),

  meta: {
    name: '그 해',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): GeuhaeQuestion {
    const pool = input.pool.items.length > 0 ? (input.pool.items as readonly YearEntry[]) : null
    const entry =
      pool !== null && pool.length > 0
        ? (pool[input.rng.int(pool.length)] as YearEntry)
        : input.rng.pick(SAMPLE_YEARS)
    return buildQuestion(entry)
  },

  judge(input: JudgeInput<GeuhaeQuestion>): Judgement {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = parseYear(input.text)
    // 숫자가 아니면 잡담이다. 판정하지 않고 채팅으로만 흘린다
    if (guess === null) return { kind: 'ignored' }

    const elapsedMs = input.atMs - input.round.startedAtMs

    if (guess === input.question.year) {
      const rank = input.round.solved.length
      const opened = openHintCount(elapsedMs)
      return {
        kind: 'correct',
        rank,
        points: roundScore({
          rank,
          elapsedMs,
          difficultyMultiplier: 1 + (MAX_HINTS - opened) * EARLY_BONUS_PER_HINT,
        }),
      }
    }

    // ±1년은 아깝다. 한 번만 인정한다 — 남발하면 찍기가 된다
    if (Math.abs(guess - input.question.year) === 1) {
      return input.round.partials.includes(input.playerId)
        ? { kind: 'wrong' }
        : { kind: 'partial', points: NEAR_POINTS }
    }

    return { kind: 'wrong' }
  },

  isRoundOver(_question: GeuhaeQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: GeuhaeQuestion): RevealData {
    return { answer: String(question.year), detail: question.card }
  },

  /** ★ 정답 누출 방지. year 도, 아직 안 열린 힌트도 담지 않는다 */
  viewFor(input: ViewInput<GeuhaeQuestion>): GeuhaeView {
    const elapsedMs = input.nowMs - input.round.startedAtMs
    const opened = openHintCount(elapsedMs)
    const nextAtMs = opened * HINT_INTERVAL_MS

    return {
      hints: input.question.hints.slice(0, opened),
      totalHints: input.question.hints.length,
      nextHintInMs: opened >= input.question.hints.length ? null : Math.max(0, nextAtMs - elapsedMs),
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
      usedNear: input.round.partials.includes(input.playerId),
    }
  },
}

export { SAMPLE_YEARS, type YearCard, type YearEntry } from './data.ts'
