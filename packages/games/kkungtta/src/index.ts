import { asGameId, type PlayerId } from '@retro/types'
import {
  escalatingPenalty,
  normalizeAnswer,
  roundScore,
  syllableLength,
  wrongCount,
  type CreateRoundInput,
  type JudgeInput,
  type Judgement,
  type RevealData,
  type RoomGame,
  type RoundState,
  type ViewInput,
} from '@retro/room-kit'
import { DICTIONARY, STARTERS } from './data.ts'

/**
 * 쿵쿵따 — 세 글자 끝말잇기. 01 문서의 계보 셋 중 마지막.
 *
 * 다른 게임과 결정적으로 다른 점: **정답이 하나가 아니다.**
 * 규칙을 만족하는 단어면 무엇이든 정답이고, 그래서 판정이
 * 「사전에 있는가 · 앞말을 이었는가 · 이미 나왔는가」 세 가지가 된다.
 *
 * ## 사전의 한계 — 정직하게 적어 둔다
 *
 * 국어사전 전체를 번들에 넣을 수는 없어서, 지금은 다른 게임들이 쓰는
 * 단어를 모아 사전으로 쓴다. 그래서 **아는 단어인데 안 받아주는 경우가 있다.**
 * 정식으로는 04 문서 파이프라인으로 명사 사전을 KV 에 올려야 한다.
 * 그때 `ContentPool` 로 갈아끼우면 이 파일은 그대로 둬도 된다.
 */

export const ROUND_MS = 60_000

/** 쿵쿵따는 세 글자다. 이걸 바꾸면 다른 게임이 된다 */
export const WORD_LENGTH = 3

/**
 * 사전이 좁아서 아는 단어가 막히는 일이 있다 (아래 주석 참고).
 * 우리 잘못으로 틀린 걸 세게 깎으면 안 된다 — 아주 약하게만.
 */
const PENALTY = { free: 4, step: 5, max: 20 } as const

export interface KkungttaQuestion {
  /** 시작 단어. 여기서부터 이어 간다 */
  readonly seedWord: string
  /** 지금까지 이어진 단어들. 첫 항목이 seedWord */
  readonly chain: readonly string[]
  /** 사전. 방 생성 시 한 번 만든다 */
  readonly dictionary: readonly string[]
}

export interface KkungttaView {
  readonly chain: readonly string[]
  /** 다음에 이어야 하는 글자 */
  readonly nextChar: string
  readonly wordLength: number
  readonly solvedCount: number
  readonly youSolved: boolean
}

/** 이어야 하는 글자 — 마지막 단어의 끝 글자 */
export function nextCharOf(chain: readonly string[]): string {
  const last = chain.at(-1) ?? ''
  return [...last].at(-1) ?? ''
}

export type ChainProblem = 'length' | 'chain' | 'repeat' | 'unknown'

/**
 * 이 단어를 이을 수 있는가. 안 되면 이유를 돌려준다 —
 * 이유를 안 알려주면 왜 안 되는지 몰라서 게임이 멈춘다.
 */
export function checkWord(
  word: string,
  chain: readonly string[],
  dictionary: readonly string[],
): ChainProblem | null {
  if (syllableLength(word) !== WORD_LENGTH) return 'length'
  if ([...word][0] !== nextCharOf(chain)) return 'chain'
  if (chain.includes(word)) return 'repeat'
  if (!dictionary.includes(word)) return 'unknown'
  return null
}

const PROBLEM_NOTE: Readonly<Record<ChainProblem, string>> = {
  length: '세 글자여야 해요',
  chain: '앞 글자로 시작해야 해요',
  repeat: '이미 나온 단어예요',
  unknown: '사전에 없는 단어예요',
}

export const kkungttaGame: RoomGame<KkungttaQuestion, KkungttaView> = {
  id: asGameId('kkungtta'),

  meta: {
    name: '쿵쿵따',
    minPlayers: 1,
    maxPlayers: 8,
    roundMs: ROUND_MS,
    hasPresenter: false,
  },

  createRound(input: CreateRoundInput): KkungttaQuestion {
    const pool =
      input.pool.items.length > 0 ? (input.pool.items as readonly string[]) : DICTIONARY
    // 이을 수 있는 단어가 있는 시작어만 고른다. 첫 수부터 막히면 게임이 아니다
    const usable = STARTERS.filter((w) =>
      pool.some((c) => c !== w && [...c][0] === [...w].at(-1)),
    )
    const list = usable.length > 0 ? usable : STARTERS
    const seedWord = list[input.rng.int(list.length)] ?? STARTERS[0] ?? '자전거'
    return { seedWord, chain: [seedWord], dictionary: pool }
  },

  judge(input: JudgeInput<KkungttaQuestion>): Judgement {
    const word = normalizeAnswer(input.text)
    if (word.length === 0) return { kind: 'ignored' }
    // 세 글자가 아니면 그냥 잡담이다. 판정으로 시끄럽게 하지 않는다
    if (syllableLength(word) !== WORD_LENGTH) return { kind: 'ignored' }

    const problem = checkWord(word, input.question.chain, input.question.dictionary)
    if (problem !== null) {
      return {
        kind: 'wrong',
        note: PROBLEM_NOTE[problem],
        // 사전에 없어서 막힌 건 사용자 잘못이 아니다. 그건 안 깎는다
        penalty:
          problem === 'unknown'
            ? 0
            : escalatingPenalty(wrongCount(input.round, input.playerId), PENALTY),
      }
    }

    // ★ 여러 번 이을 수 있다. 한 번 맞혔다고 끝나지 않는 유일한 게임이다
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

  /** 시간이 다 될 때까지 계속 잇는다. 전원 정답으로 끝나지 않는다 */
  isRoundOver(): boolean {
    return false
  },

  reveal(question: KkungttaQuestion): RevealData {
    return {
      answer: `${question.chain.length}개까지 이었어요`,
      detail: { chain: question.chain },
    }
  },

  viewFor(input: ViewInput<KkungttaQuestion>): KkungttaView {
    return {
      chain: input.question.chain,
      nextChar: nextCharOf(input.question.chain),
      wordLength: WORD_LENGTH,
      solvedCount: input.round.solved.length,
      youSolved: input.round.solved.includes(input.playerId),
    }
  },
}

export type { PlayerId }
export { DICTIONARY, STARTERS } from './data.ts'

/** 정답이 나오면 사슬을 잇는다. 이 게임만 라운드 안에서 문제가 자란다 */
kkungttaGame.advance = (question, input) => {
  const word = normalizeAnswer(input.text)
  if (checkWord(word, question.chain, question.dictionary) !== null) return question
  return { ...question, chain: [...question.chain, word] }
}
