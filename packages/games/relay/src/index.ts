import { asGameId, filterByTopics, type PlayerId } from '@retro/types'
import {
  escalatingPenalty,
  normalizeAnswer,
  roundScore,
  syllableLength,
  toChosung,
  wrongCount,
  type BlockedWordsInput,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type PresenterInput,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ScoreDelta,
  type ViewInput,
} from '@retro/room-kit'
import { SAMPLE_SUBJECTS, type SketchSubject } from '@retro/game-sketch'

/**
 * 이어 그리기 — 여럿이 한 그림을 완성한다.
 *
 * 스케치와 소재도, 캔버스도 같다. **다른 건 하나뿐이다 —
 * 그리는 사람이 라운드 도중에 계속 바뀐다.**
 *
 * ## 왜 재밌는가
 *
 * 앞사람이 뭘 그리려던 건지 모른 채 이어 그려야 한다. 그래서 결과물이
 * 매번 무너지고, **그 무너지는 과정 자체가 콘텐츠**가 된다. 잘 그리는
 * 사람이 유리하지 않다는 점도 크다 — 스케치는 그림 실력이 곧 점수인데
 * 여기는 아니다.
 *
 * ## 정답은 그리는 사람들만 안다
 *
 * 그리는 순서에 든 사람은 전원 정답을 본다. 나머지가 맞힌다.
 * 그래서 최소 3명이 필요하다 — 그리는 사람 둘, 맞히는 사람 하나.
 */

export const ROUND_MS = 90_000

/** 한 사람이 그리는 시간. 짧아야 「이어 그린다」는 감각이 산다 */
export const TURN_MS = 12_000

/** 몇 명이 이어 그리는가 */
export const DRAWERS = 3

const PENALTY = { free: 3, step: 10, max: 40 } as const
const DRAWER_PER_SOLVER = 25
const DRAWER_MAX = 100

export interface RelayQuestion {
  readonly word: string
  readonly category: string
  readonly length: number
  readonly answers: readonly string[]
  readonly banned: readonly string[]
}

export interface RelayDrawerView {
  readonly role: 'drawer'
  readonly word: string
  readonly category: string
  /** 지금 내 차례인가. 아니면 보기만 한다 */
  readonly myTurn: boolean
  /** 내 차례가 끝나는 절대 시각. 내 차례가 아니면 null */
  readonly turnEndsAtMs: number | null
  readonly turn: number
  readonly totalTurns: number
  readonly solvedCount: number
}

export interface RelayGuesserView {
  readonly role: 'guesser'
  readonly category: string
  readonly length: number
  readonly presenter: PlayerId | null
  readonly turn: number
  readonly totalTurns: number
  readonly solvedCount: number
  readonly youSolved: boolean
}

export type RelayView = RelayDrawerView | RelayGuesserView

export const isRelayDrawerView = (v: RelayView): v is RelayDrawerView => v.role === 'drawer'

/** 지금 몇 번째 차례인가 (0-based). 시간이 넘치면 마지막에 머문다 */
export function turnAt(elapsedMs: number, turns: number): number {
  if (elapsedMs < 0) return 0
  return Math.min(turns - 1, Math.floor(elapsedMs / TURN_MS))
}

function expandBanned(entry: SketchSubject): readonly string[] {
  const out = new Set<string>()
  for (const seed of [entry.word, ...entry.aliases]) {
    const base = normalizeAnswer(seed)
    if (base.length === 0) continue
    out.add(base)
    out.add(toChosung(base))
    if (syllableLength(base) >= 2) {
      for (const ch of [...base]) if (ch.trim().length > 0) out.add(ch)
    }
  }
  return [...out].filter((w) => w.length > 0)
}

export const relayGame: RoomGame<RelayQuestion, RelayView> = {
  id: asGameId('relay'),

  meta: {
    name: '이어 그리기',
    // 그리는 사람 둘 + 맞히는 사람 하나
    minPlayers: 3,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: true,
  },

  createRound(input: CreateRoundInput): RelayQuestion {
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly SketchSubject[]) : SAMPLE_SUBJECTS
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_SUBJECTS[0]

    return {
      word: entry.word,
      category: entry.category,
      length: syllableLength(entry.word),
      answers: [entry.word, ...entry.aliases].map(normalizeAnswer),
      banned: expandBanned(entry),
    }
  },

  /**
   * ★ 라운드 도중에 그리는 사람이 바뀐다.
   *
   * 후보 목록에서 순서대로 돌린다. 명단을 미리 못 박지 않는 이유는
   * 중간에 누가 나가면 그 자리가 비어버리기 때문이다 — 매번 지금 있는
   * 사람으로 계산하면 나가도 그림이 안 멈춘다.
   */
  presenterAt(input: PresenterInput<RelayQuestion>): PlayerId | null {
    const { candidates } = input
    if (candidates.length === 0) return null

    // 그리는 사람은 최대 DRAWERS 명. 나머지는 맞히는 쪽에 남겨야 게임이 된다
    const seats = Math.max(1, Math.min(DRAWERS, candidates.length - 1))
    const turn = turnAt(input.nowMs - input.round.startedAtMs, seats)
    return candidates[turn % candidates.length] ?? null
  },

  judge(input: JudgeInput<RelayQuestion>): Judgement {
    // 그린 사람은 답을 봤으므로 맞혀도 소용없다
    if (input.round.presenters.includes(input.playerId)) return { kind: 'ignored' }
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = normalizeAnswer(input.text)
    if (guess.length === 0) return { kind: 'ignored' }

    if (!input.question.answers.includes(guess)) {
      if (syllableLength(guess) !== input.question.length) return { kind: 'ignored' }
      return {
        kind: 'wrong',
        penalty: escalatingPenalty(wrongCount(input.round, input.playerId), PENALTY),
      }
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

  isRoundOver(_question: RelayQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: RelayQuestion): RevealData {
    return { answer: question.word, detail: { category: question.category } }
  },

  /** ★ 지금까지 그린 사람 전원이 정답을 본다. 나머지는 못 본다 */
  viewFor(input: ViewInput<RelayQuestion>): RelayView {
    const elapsed = input.nowMs - input.round.startedAtMs
    const turn = turnAt(elapsed, DRAWERS)
    const drew = input.round.presenters.includes(input.playerId)
    const mine = input.round.presenter === input.playerId

    if (drew || mine) {
      return {
        role: 'drawer',
        word: input.question.word,
        category: input.question.category,
        myTurn: mine,
        turnEndsAtMs: mine ? input.round.startedAtMs + (turn + 1) * TURN_MS : null,
        turn: turn + 1,
        totalTurns: DRAWERS,
        solvedCount: input.round.solved.length,
      }
    }

    return {
      role: 'guesser',
      category: input.question.category,
      length: input.question.length,
      presenter: input.round.presenter,
      turn: turn + 1,
      totalTurns: DRAWERS,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },

  /** 그린 사람 전원이 정답을 말로 흘리지 못하게 막는다 */
  blockedWordsFor(input: BlockedWordsInput<RelayQuestion>): readonly string[] {
    return input.round.presenters.includes(input.playerId) ? input.question.banned : []
  },

  /** 그린 사람들이 보너스를 나눠 갖는다. 혼자 잘 그려서 되는 게 아니다 */
  roundEndBonus(_question: RelayQuestion, round: RoundState): readonly ScoreDelta[] {
    if (round.solved.length === 0) return []
    const points = Math.min(DRAWER_MAX, round.solved.length * DRAWER_PER_SOLVER)
    return round.presenters.map((id) => [id, points] as ScoreDelta)
  },
}
