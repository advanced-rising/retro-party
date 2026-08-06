import { asGameId, filterByTopics, type PlayerId } from '@retro/types'
import {
  firstJungsung,
  normalizeAnswer,
  roundScore,
  syllableLength,
  toChosung,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ViewInput,
} from '@retro/room-kit'
import { SAMPLE_WORDS, type ChosungWord } from './data.ts'

/**
 * 초성 퀴즈 — 02 문서 §2
 *
 * 20초. 초성 + 카테고리로 시작해 시간이 지나면 힌트가 열린다.
 * 채팅으로 답을 외치고, 서로 다른 정답으로 여러 명이 맞을 수 있다.
 */

export const ROUND_MS = 20_000
const HINT_AT_MS = 8_000
const VOWEL_AT_MS = 14_000

/** 서버만 보유한다. viewFor 를 거치지 않고는 클라이언트로 나갈 수 없다. */
export interface ChosungQuestion {
  readonly word: string
  readonly chosung: string
  readonly length: number
  readonly category: string
  readonly hint: string
  readonly firstVowel: string | null
  readonly answers: readonly string[]
}

/** 클라이언트가 받는 것. word 와 answers 가 없다. */
export interface ChosungView {
  readonly chosung: string
  readonly length: number
  readonly category: string
  /** 8초 전에는 null */
  readonly hint: string | null
  /** 14초 전에는 null */
  readonly firstVowel: string | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

function buildQuestion(entry: ChosungWord): ChosungQuestion {
  return {
    word: entry.word,
    chosung: toChosung(entry.word),
    length: syllableLength(entry.word),
    category: entry.category,
    hint: entry.hint,
    firstVowel: firstJungsung(entry.word),
    answers: [entry.word, ...entry.aliases].map(normalizeAnswer),
  }
}

export const chosungGame: RoomGame<ChosungQuestion, ChosungView> = {
  id: asGameId('chosung'),

  meta: {
    name: '초성 퀴즈',
    minPlayers: 2,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): ChosungQuestion {
    // 콘텐츠 풀이 비어 있으면 샘플로 떨어진다 (Phase 0.5)
    // 콘텐츠 풀이 비어 있으면 샘플로 떨어진다. 그 다음 고른 주제로 좁힌다
    const source =
      input.pool.items.length > 0 ? (input.pool.items as readonly ChosungWord[]) : SAMPLE_WORDS
    const picked = filterByTopics(source, input.topics)
    const entry = picked[input.rng.int(picked.length)] ?? SAMPLE_WORDS[0]
    return buildQuestion(entry)
  },

  judge(input: JudgeInput<ChosungQuestion>): Judgement {
    const alreadySolved = input.round.solved.includes(input.playerId)
    if (alreadySolved) return { kind: 'ignored' }

    const guess = normalizeAnswer(input.text)
    if (guess.length === 0) return { kind: 'ignored' }

    if (!input.question.answers.includes(guess)) {
      // 정답 시도인지 잡담인지 가른다.
      //   초성이 같으면 확실한 시도. 글자 수만 같아도 시도로 본다.
      //   둘 다 아니면 잡담이므로 채팅에만 흐르고 판정하지 않는다.
      const attempt =
        toChosung(guess) === input.question.chosung ||
        syllableLength(guess) === input.question.length
      return attempt ? { kind: 'wrong' } : { kind: 'ignored' }
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

  isRoundOver(_question: ChosungQuestion, round: RoundState): boolean {
    // 시간 만료는 방 상태 머신이 따로 본다. 여기서는 전원 정답만 판정한다.
    return round.solved.length > 0 && round.solved.length >= round.expectedSolvers
  },

  reveal(question: ChosungQuestion): RevealData {
    return {
      answer: question.word,
      detail: { category: question.category, hint: question.hint },
    }
  },

  /** 힌트가 열리는 시각 — 「힌트 먼저 보기」 투표가 이 값을 본다 */
  nextRevealAtMs(_question, round, nowMs): number | null {
    const elapsed = nowMs - round.startedAtMs
    if (elapsed < HINT_AT_MS) return round.startedAtMs + HINT_AT_MS
    if (elapsed < VOWEL_AT_MS) return round.startedAtMs + VOWEL_AT_MS
    return null
  },

  /** ★ 정답 누출 방지. word · answers 를 절대 담지 않는다. */
  viewFor(input: ViewInput<ChosungQuestion>): ChosungView {
    const elapsed = input.nowMs - input.round.startedAtMs
    return {
      chosung: input.question.chosung,
      length: input.question.length,
      category: input.question.category,
      hint: elapsed >= HINT_AT_MS ? input.question.hint : null,
      firstVowel: elapsed >= VOWEL_AT_MS ? input.question.firstVowel : null,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },
}

export { SAMPLE_WORDS, type ChosungWord } from './data.ts'
export type { PlayerId }
