import type { TeamId, TeamSize } from '@retro/types'

/**
 * 팀 편성 — 01 문서 §6.5.1
 *
 * 홀수·불균형 팀은 만들지 않는다. 3대4 는 시작부터 불공평하다.
 * 모자라면 AI 로 채우되 반드시 양 팀에 균등하게 넣는다.
 */

export interface TeamPlan {
  readonly teamSize: TeamSize
  /** 양 팀에 나눠 넣을 AI 수 (짝수) */
  readonly aiCount: number
}

const PLANS: readonly { readonly humans: number; readonly plan: TeamPlan }[] = [
  { humans: 8, plan: { teamSize: 4, aiCount: 0 } },
  { humans: 7, plan: { teamSize: 4, aiCount: 1 } },
  { humans: 6, plan: { teamSize: 3, aiCount: 0 } },
  { humans: 5, plan: { teamSize: 3, aiCount: 1 } },
  { humans: 4, plan: { teamSize: 2, aiCount: 0 } },
  { humans: 3, plan: { teamSize: 2, aiCount: 1 } },
]

/** 사람 수로 편성을 정한다. 3명 미만이면 팀전 불가 → null */
export function planTeams(humanCount: number): TeamPlan | null {
  for (const entry of PLANS) {
    if (humanCount >= entry.humans) return entry.plan
  }
  return null
}

/**
 * 참가자를 두 팀에 번갈아 배정한다.
 * AI 는 마지막에 배정되므로 양 팀에 균등하게 흩어진다.
 */
export function assignTeams<T>(ordered: readonly T[]): ReadonlyMap<T, TeamId> {
  const out = new Map<T, TeamId>()
  ordered.forEach((member, i) => {
    out.set(member, (i % 2) as TeamId)
  })
  return out
}

export function teamLabel(team: TeamId): '청팀' | '홍팀' {
  return team === 0 ? '청팀' : '홍팀'
}
