import type { PlayerId, TeamId } from '@retro/types'

/**
 * 점수 — 01 문서 §4.3
 *
 * 꼴찌도 30점은 받는다. 0점이 반복되면 나간다.
 * 격차는 벌리되 바닥은 만들지 않는다.
 */

const RANK_POINTS = [100, 70, 50] as const
const TAIL_POINTS = 30

/** 문제 공개 후 이 시간 안에 맞히면 속도 보너스 */
const FAST_ANSWER_MS = 5_000
const FAST_MULTIPLIER = 1.5

export interface ScoreInput {
  /** 0-based. 이 라운드에서 몇 번째로 맞혔는가 */
  readonly rank: number
  readonly elapsedMs: number
  /** 힌트가 적게 열렸을 때 맞히면 가산 (그 해). 없으면 1 */
  readonly difficultyMultiplier?: number
}

export function roundScore(input: ScoreInput): number {
  const base = RANK_POINTS[input.rank] ?? TAIL_POINTS
  const speed = input.elapsedMs <= FAST_ANSWER_MS ? FAST_MULTIPLIER : 1
  const difficulty = input.difficultyMultiplier ?? 1
  return Math.round(base * speed * difficulty)
}

/** 팀 점수는 팀원 점수의 합 — 01 문서 §6.5 */
export function teamTotals(
  scores: ReadonlyMap<PlayerId, number>,
  teamOf: (id: PlayerId) => TeamId | null,
): ReadonlyMap<TeamId, number> {
  const totals = new Map<TeamId, number>()
  for (const [playerId, score] of scores) {
    const team = teamOf(playerId)
    if (team === null) continue
    totals.set(team, (totals.get(team) ?? 0) + score)
  }
  return totals
}

/**
 * 경험치 — 10 문서 §1.2
 *
 * 파밍 방어(10 문서 §6): 참가자가 전부 사람이므로 봇 파밍은 불가능하지만,
 * 둘이서 방을 잠그고 반복하는 경로는 남는다. 소인원 판은 절반으로 깎는다.
 */
export interface XpInput {
  readonly finished: boolean
  readonly rank: number
  readonly correctCount: number
  readonly assistCount: number
  readonly isFirstGameToday: boolean
  /** 이 판에 실제로 참여한 사람 수 */
  readonly playerCount: number
}

const SMALL_ROOM_THRESHOLD = 3

export function matchXp(input: XpInput): number {
  if (!input.finished) return 0

  const rankBonus = input.rank === 0 ? 150 : input.rank === 1 ? 100 : input.rank === 2 ? 70 : 40
  const raw =
    100 +
    rankBonus +
    input.correctCount * 20 +
    input.assistCount * 10 +
    (input.isFirstGameToday ? 200 : 0)

  return input.playerCount < SMALL_ROOM_THRESHOLD ? Math.round(raw * 0.5) : raw
}
