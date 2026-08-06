import { asGameId, filterByTopics, type PlayerId } from '@retro/types'
import {
  normalizeAnswer,
  roundScore,
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
import { SAMPLE_WORDS, type AssocWord } from './data.ts'

/**
 * 단어 연상 — 02 문서 §3
 *
 * 출제자가 채팅으로 설명하고 나머지가 채팅으로 맞힌다.
 * 콘텐츠 비용이 거의 0이다. 설명은 사람이 만들고, 매번 다르다.
 *
 * 출제자가 없으면(혼자 모드) 사전 생성된 3단계 스크립트가 시간에 따라 열린다.
 * 가짜 출제자를 참가자 목록에 세우지 않는다 — 03 문서 §7.3
 */

export const ROUND_MS = 90_000
/** 혼자 모드에서 스크립트가 열리는 시각 */
const SCRIPT_AT_MS = [0, 30_000, 60_000] as const

/** 출제자 보너스 — 맞힌 사람 수 × 40, 최대 160 — 02 문서 §3.5 */
const PRESENTER_PER_SOLVER = 40
const PRESENTER_MAX = 160

export interface AssocQuestion {
  readonly word: string
  readonly category: string
  readonly length: number
  readonly answers: readonly string[]
  /** 출제자가 쓸 수 없는 말. 출제자에게만 적용된다 */
  readonly banned: readonly string[]
  /** 혼자 모드용. 사람 출제자가 있으면 쓰지 않는다 */
  readonly script: readonly string[]
  readonly presenter: PlayerId | null
}

/** 출제자가 보는 화면 — 정답이 보인다. 이 사람만 */
export interface AssocPresenterView {
  readonly role: 'presenter'
  readonly word: string
  readonly category: string
  readonly banned: readonly string[]
  readonly solvedCount: number
}

/** 나머지가 보는 화면 — 카테고리와 글자 수만 */
export interface AssocGuesserView {
  readonly role: 'guesser'
  readonly category: string
  readonly length: number
  readonly presenter: PlayerId | null
  /** 혼자 모드에서 시간에 따라 열리는 설명. 사람 출제자가 있으면 빈 배열 */
  readonly script: readonly string[]
  readonly solvedCount: number
  readonly youSolved: boolean
}

export type AssocView = AssocPresenterView | AssocGuesserView

export const isPresenterView = (view: AssocView): view is AssocPresenterView =>
  view.role === 'presenter'

/**
 * 금칙어 자동 확장 — 02 문서 §3.4
 *
 * 정답 그 자체, 부분 문자열, 별칭, 초성, 띄어쓰기·반복 변형까지 막는다.
 * **완벽하게는 못 막는다.** 다만 우회하면 라운드가 재미없어지고 그건
 * 본인 점수 손해라서 자정 작용이 어느 정도 있다.
 */
export function expandBanned(entry: AssocWord): readonly string[] {
  const out = new Set<string>()
  const seeds = [entry.word, ...entry.aliases, ...entry.banned]

  for (const seed of seeds) {
    const base = normalizeAnswer(seed)
    if (base.length === 0) continue
    out.add(base)
    out.add(toChosung(base))
    // 반복 변형 — "삐삐삐"
    out.add(base + base.slice(-1))
    // 두 글자 이상이면 각 음절도 막는다 — "삐"
    if (syllableLength(base) >= 2) {
      for (const ch of [...base]) if (ch.trim().length > 0) out.add(ch)
    }
  }
  return [...out].filter((w) => w.length > 0)
}

function buildQuestion(entry: AssocWord, presenter: PlayerId | null): AssocQuestion {
  return {
    word: entry.word,
    category: entry.category,
    length: syllableLength(entry.word),
    answers: [entry.word, ...entry.aliases].map(normalizeAnswer),
    banned: expandBanned(entry),
    script: entry.script,
    presenter,
  }
}

export const assocGame: RoomGame<AssocQuestion, AssocView> = {
  id: asGameId('assoc'),

  meta: {
    name: '단어 연상',
    // 혼자 모드에서는 스크립트가 출제자를 대신하므로 1명도 성립한다
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: true,
  },

  createRound(input: CreateRoundInput): AssocQuestion {
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly AssocWord[]) : SAMPLE_WORDS
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_WORDS[0]
    return buildQuestion(entry, input.presenter)
  },

  judge(input: JudgeInput<AssocQuestion>): Judgement {
    // 출제자는 판정 대상이 아니다. 엔진이 이미 걸러주지만 여기서도 막는다
    if (input.playerId === input.question.presenter) return { kind: 'ignored' }
    if (input.round.solved.includes(input.playerId)) return { kind: 'ignored' }

    const guess = normalizeAnswer(input.text)
    if (guess.length === 0) return { kind: 'ignored' }

    if (!input.question.answers.includes(guess)) {
      // 글자 수가 맞으면 진지한 시도로 본다. 아니면 설명에 대한 잡담이다
      return syllableLength(guess) === input.question.length
        ? { kind: 'wrong' }
        : { kind: 'ignored' }
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

  isRoundOver(_question: AssocQuestion, round: RoundState): boolean {
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: AssocQuestion): RevealData {
    return { answer: question.word, detail: { category: question.category } }
  },

  /** 혼자 모드에서만 열 것이 있다. 사람 출제자가 있으면 그 사람 몫이다 */
  nextRevealAtMs(question, round, nowMs): number | null {
    if (question.presenter !== null) return null
    const elapsed = nowMs - round.startedAtMs
    const next = SCRIPT_AT_MS.find((at) => at > elapsed)
    return next === undefined ? null : round.startedAtMs + next
  },

  /** ★ 정답 누출 방지. 출제자 외에는 word 가 담기지 않는다 */
  viewFor(input: ViewInput<AssocQuestion>): AssocView {
    if (input.playerId === input.question.presenter) {
      return {
        role: 'presenter',
        word: input.question.word,
        category: input.question.category,
        banned: input.question.banned,
        solvedCount: input.round.solved.length,
      }
    }

    // 사람 출제자가 있으면 스크립트를 쓰지 않는다
    const elapsedMs = input.nowMs - input.round.startedAtMs
    const script =
      input.question.presenter === null
        ? input.question.script.filter((_, i) => elapsedMs >= (SCRIPT_AT_MS[i] ?? Infinity))
        : []

    return {
      role: 'guesser',
      category: input.question.category,
      length: input.question.length,
      presenter: input.question.presenter,
      script,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },

  /** ★ 출제자만 정답을 말할 수 없다. 맞히는 사람은 정답을 쳐야 이긴다 */
  blockedWordsFor(input: BlockedWordsInput<AssocQuestion>): readonly string[] {
    return input.playerId === input.question.presenter ? input.question.banned : []
  },

  /**
   * 출제자 보너스 — 맞힌 사람 수에 연동한다.
   * 아무도 못 맞히면 0점이라, 너무 어렵게 내면 본인이 손해다 (02 문서 §3.5)
   */
  roundEndBonus(question: AssocQuestion, round: RoundState): readonly ScoreDelta[] {
    if (question.presenter === null || round.solved.length === 0) return []
    const points = Math.min(PRESENTER_MAX, round.solved.length * PRESENTER_PER_SOLVER)
    return [[question.presenter, points]]
  },
}

export { SAMPLE_WORDS, type AssocWord } from './data.ts'
