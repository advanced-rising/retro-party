import type { PlayerId, TeamId, TeamSize } from '@retro/types'

/**
 * 팀 편성 — 01 문서 §6.5.1
 *
 * 홀수·불균형 팀은 만들지 않는다. 3대4 는 시작부터 불공평하다.
 * 참가자는 전부 사람이므로 빈 자리를 채울 방법이 없다.
 * 인원이 홀수면 한 명이 이번 판을 쉬고, 다음 판에 우선 배정된다.
 */

export interface TeamPlan {
  readonly teamSize: TeamSize
  /** 이번 판을 쉬는 인원 수. 0 또는 1 */
  readonly benchCount: number
}

/** 사람 수로 편성을 정한다. 4명 미만이면 팀전 불가 → null */
export function planTeams(playerCount: number): TeamPlan | null {
  if (playerCount < 4) return null
  const perTeam = Math.min(4, Math.floor(playerCount / 2))
  return {
    teamSize: perTeam as TeamSize,
    benchCount: playerCount - perTeam * 2,
  }
}

export interface AssignInput {
  /** 배정 순서. 앞에 있을수록 먼저 자리를 받는다 */
  readonly ordered: readonly PlayerId[]
  readonly plan: TeamPlan
}

export interface Assignment {
  readonly teams: ReadonlyMap<PlayerId, TeamId>
  /** 이번 판을 쉬는 사람. 다음 판 배정에서 맨 앞으로 보낸다 */
  readonly benched: readonly PlayerId[]
}

/** 두 팀에 번갈아 배정하고, 남는 사람은 벤치로 보낸다 */
export function assignTeams(input: AssignInput): Assignment {
  const seats = input.plan.teamSize * 2
  const playing = input.ordered.slice(0, seats)
  const teams = new Map<PlayerId, TeamId>()
  playing.forEach((playerId, i) => {
    teams.set(playerId, (i % 2) as TeamId)
  })
  return { teams, benched: input.ordered.slice(seats) }
}

/**
 * 다음 판의 배정 순서. 이번에 쉰 사람이 맨 앞으로 온다 —
 * 같은 사람이 두 판 연속으로 쉬면 그 사람은 방을 나간다.
 */
export function rotateForNextMatch(
  ordered: readonly PlayerId[],
  benched: readonly PlayerId[],
): readonly PlayerId[] {
  const rest = ordered.filter((id) => !benched.includes(id))
  return [...benched, ...rest]
}

export function teamLabel(team: TeamId): '청팀' | '홍팀' {
  return team === 0 ? '청팀' : '홍팀'
}
