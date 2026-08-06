import { asGameId, filterByTopics, type PlayerId } from '@retro/types'
import {
  escalatingPenalty,
  normalizeAnswer,
  roundScore,
  wrongCount,
  syllableLength,
  toChosung,
  type BlockedWordsInput,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ScoreDelta,
  type ViewInput,
} from '@retro/room-kit'
import { SAMPLE_SUBJECTS, type SketchSubject } from './data.ts'

/**
 * 스케치 — 캐치마인드 계보.
 *
 * 단어 연상과 구조가 같다. 출제자만 답을 보고, 나머지가 채팅으로 맞힌다.
 * **다른 점은 출제자가 말 대신 그린다는 것 하나뿐이다.**
 *
 * 그래서 이 모듈은 그림을 전혀 모른다 — 획은 방 엔진이 중계하고,
 * 여기서는 누가 출제자인지, 무엇을 그려야 하는지, 정답이 무엇인지만 다룬다.
 * 덕분에 판정 로직을 단어 연상과 그대로 공유한다.
 */

export const ROUND_MS = 90_000

/** 그림을 보고 떠올리는 게임이라 넉넉히 봐준다 */
const PENALTY = { free: 3, step: 10, max: 40 } as const

/** 출제자 보너스 — 맞힌 사람 수 × 40, 최대 160 (02 문서 §3.5 와 같은 규칙) */
const PRESENTER_PER_SOLVER = 40
const PRESENTER_MAX = 160

export interface SketchQuestion {
  readonly word: string
  readonly category: string
  readonly length: number
  readonly answers: readonly string[]
  readonly banned: readonly string[]
  readonly presenter: PlayerId | null
}

/** 출제자가 보는 것 — 무엇을 그려야 하는지 */
export interface SketchDrawerView {
  readonly role: 'drawer'
  readonly word: string
  readonly category: string
  readonly solvedCount: number
}

/** 나머지가 보는 것 — 그림과 글자 수만 */
export interface SketchGuesserView {
  readonly role: 'guesser'
  readonly category: string
  readonly length: number
  readonly presenter: PlayerId | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

export type SketchView = SketchDrawerView | SketchGuesserView

export const isDrawerView = (view: SketchView): view is SketchDrawerView =>
  view.role === 'drawer'

/**
 * 출제자가 글로 답을 알려주지 못하게 막는다.
 * 그림 게임이라 채팅으로 정답을 흘리는 순간 게임이 끝난다 — 02 문서 §3.4 와 같은 장치.
 */
export function expandBanned(entry: SketchSubject): readonly string[] {
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

function buildQuestion(entry: SketchSubject, presenter: PlayerId | null): SketchQuestion {
  return {
    word: entry.word,
    category: entry.category,
    length: syllableLength(entry.word),
    answers: [entry.word, ...entry.aliases].map(normalizeAnswer),
    banned: expandBanned(entry),
    presenter,
  }
}

export const sketchGame: RoomGame<SketchQuestion, SketchView> = {
  id: asGameId('sketch'),

  meta: {
    name: '스케치',
    // 그리는 사람과 맞히는 사람이 따로 있어야 성립한다
    minPlayers: 2,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: true,
  },

  createRound(input: CreateRoundInput): SketchQuestion {
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly SketchSubject[]) : SAMPLE_SUBJECTS
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_SUBJECTS[0]
    return buildQuestion(entry, input.presenter)
  },

  judge(input: JudgeInput<SketchQuestion>): Judgement {
    if (input.playerId === input.question.presenter) return { kind: 'ignored' }
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

  isRoundOver(_question: SketchQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: SketchQuestion): RevealData {
    return { answer: question.word, detail: { category: question.category } }
  },

  /** ★ 출제자 외에는 word 가 담기지 않는다 */
  viewFor(input: ViewInput<SketchQuestion>): SketchView {
    if (input.playerId === input.question.presenter) {
      return {
        role: 'drawer',
        word: input.question.word,
        category: input.question.category,
        solvedCount: input.round.solved.length,
      }
    }
    return {
      role: 'guesser',
      category: input.question.category,
      length: input.question.length,
      presenter: input.question.presenter,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },

  /** ★ 그리는 사람만 정답을 말할 수 없다 */
  blockedWordsFor(input: BlockedWordsInput<SketchQuestion>): readonly string[] {
    return input.playerId === input.question.presenter ? input.question.banned : []
  },

  roundEndBonus(question: SketchQuestion, round: RoundState): readonly ScoreDelta[] {
    if (question.presenter === null || round.solved.length === 0) return []
    return [[question.presenter, Math.min(PRESENTER_MAX, round.solved.length * PRESENTER_PER_SOLVER)]]
  },
}

export { SAMPLE_SUBJECTS, type SketchSubject } from './data.ts'
