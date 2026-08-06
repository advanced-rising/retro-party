import { asGameId } from '@retro/types'
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

/**
 * 숫자 야구 — 이 묶음에서 유일한 **추리** 게임.
 *
 * 다른 여덟 개는 전부 「알고 있느냐」를 묻는다. 이건 아무것도 몰라도 되고,
 * 대신 앞에서 받은 판정을 조합해서 좁혀 간다. 그래서 리듬이 완전히 다르다.
 *
 * ## 콘텐츠가 0이다
 *
 * 문제를 사람이 만들지 않는다. 시드로 숫자를 뽑을 뿐이라 영원히 안 닳는다.
 * 콘텐츠 파이프라인(04 문서)이 손댈 게 없는 유일한 게임이다.
 *
 * ## 판정이 곧 힌트다
 *
 * 틀려도 「2스트라이크 1볼」이 돌아온다. 이 되먹임이 게임의 전부라서,
 * 「그때 그 가격」처럼 **벌점을 세게 걸면 안 된다** — 틀리면서 좁히는 게 정상이다.
 */

export const ROUND_MS = 90_000

/** 자릿수. 세 자리가 고전이고, 네 자리는 90초에 안 끝난다 */
export const DIGITS = 3

/** 틀리면서 좁히는 게 게임이라 아주 관대하게 */
const PENALTY = { free: 10, step: 5, max: 20 } as const

export interface BaseballQuestion {
  /** 서로 다른 숫자 세 개. 첫 자리에 0 이 오지 않는다 */
  readonly secret: string
}

export interface BaseballView {
  readonly digits: number
  readonly solvedCount: number
  readonly youSolved: boolean
  /** 내가 지금까지 몇 번 던졌는가 */
  readonly tries: number
}

export interface Verdict {
  readonly strikes: number
  readonly balls: number
}

/**
 * 채팅에서 숫자를 읽는다. `123` `1 2 3` 둘 다 받는다.
 * **자리마다 다른 숫자**여야 한다 — 같은 숫자가 겹치면 판정이 성립하지 않는다.
 */
export function parseGuess(text: string, digits: number): string | null {
  const cleaned = [...text.trim()].filter((ch) => /\d/u.test(ch)).join('')
  if (cleaned.length !== digits) return null
  if (new Set(cleaned).size !== digits) return null
  return cleaned
}

/** 스트라이크는 자리까지 맞은 것, 볼은 숫자만 있는 것 */
export function judgeGuess(guess: string, secret: string): Verdict {
  let strikes = 0
  let balls = 0
  for (let i = 0; i < guess.length; i++) {
    const ch = guess[i]
    if (ch === undefined) continue
    if (secret[i] === ch) strikes++
    else if (secret.includes(ch)) balls++
  }
  return { strikes, balls }
}

export function verdictText(verdict: Verdict): string {
  if (verdict.strikes === 0 && verdict.balls === 0) return '아웃'
  const parts: string[] = []
  if (verdict.strikes > 0) parts.push(`${verdict.strikes}스트라이크`)
  if (verdict.balls > 0) parts.push(`${verdict.balls}볼`)
  return parts.join(' ')
}

/** 서로 다른 자릿수로 된 숫자를 만든다. 첫 자리는 0 이 아니다 */
function makeSecret(pick: (max: number) => number, digits: number): string {
  const pool = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const chosen: string[] = []
  while (chosen.length < digits) {
    const index = pick(pool.length)
    const ch = pool[index]
    if (ch === undefined) continue
    pool.splice(index, 1)
    // 첫 자리에 0 이 오면 「012」 같은 표기가 돼서 헷갈린다
    if (chosen.length === 0 && ch === '0') {
      pool.push(ch)
      continue
    }
    chosen.push(ch)
  }
  return chosen.join('')
}

export const baseballGame: RoomGame<BaseballQuestion, BaseballView> = {
  id: asGameId('baseball'),

  meta: {
    name: '숫자 야구',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): BaseballQuestion {
    return { secret: makeSecret((max) => input.rng.int(max), DIGITS) }
  },

  judge(input: JudgeInput<BaseballQuestion>): Judgement {
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = parseGuess(input.text, DIGITS)
    // 숫자가 아니거나 자리가 겹치면 잡담이다. 판정으로 시끄럽게 하지 않는다
    if (guess === null) return { kind: 'ignored' }

    const verdict = judgeGuess(guess, input.question.secret)

    if (verdict.strikes === DIGITS) {
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

    // ★ 판정이 곧 힌트다. 이 한 줄이 없으면 게임이 성립하지 않는다
    return {
      kind: 'wrong',
      note: verdictText(verdict),
      penalty: escalatingPenalty(wrongCount(input.round, input.playerId), PENALTY),
    }
  },

  isRoundOver(_question: BaseballQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: BaseballQuestion): RevealData {
    return { answer: question.secret, detail: { digits: DIGITS } }
  },

  /** ★ secret 을 담지 않는다. 여기 실리면 게임이 0초 만에 끝난다 */
  viewFor(input: ViewInput<BaseballQuestion>): BaseballView {
    return {
      digits: DIGITS,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
      tries: wrongCount(input.round, input.playerId),
    }
  },
}
