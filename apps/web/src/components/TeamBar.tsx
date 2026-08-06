'use client'

import { m } from 'motion/react'
import type { Participant, PlayerId, TeamId } from '@retro/types'
import { TWEEN_FLOW, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 팀 점수 — 팀전 진행 중에 항상 보인다.
 *
 * 팀전인데 팀 점수가 안 보이면 팀전이 아니다. 개인 점수만 보면
 * 「우리가 이기고 있나」를 알 수 없어서 팀으로 뭉칠 이유가 사라진다.
 *
 * 막대는 두 팀의 **비율**이다. 절대값이 아니라 격차를 보여줘야
 * 따라잡을 수 있는지가 한눈에 온다.
 */
export function TeamBar({
  participants,
  scores,
  yourTeam,
}: {
  participants: readonly Participant[]
  scores: ReadonlyMap<PlayerId, number>
  yourTeam: TeamId | null
}) {
  const motionOk = useMotionOk()

  const totals = new Map<TeamId, number>([
    [0, 0],
    [1, 0],
  ])
  for (const p of participants) {
    if (p.team === null) continue
    totals.set(p.team, (totals.get(p.team) ?? 0) + (scores.get(p.playerId) ?? 0))
  }

  const blue = totals.get(0) ?? 0
  const red = totals.get(1) ?? 0
  // 마이너스가 있어도 막대가 깨지지 않게 바닥을 0 으로 옮겨 비율을 낸다
  const floor = Math.min(0, blue, red)
  const span = Math.max(1, blue - floor + (red - floor))
  const blueRatio = (blue - floor) / span

  return (
    <div className="flex items-center gap-2">
      <Side label="청팀" score={blue} color="var(--blue)" mine={yourTeam === 0} />

      <span
        className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--red)' }}
        role="img"
        aria-label={`청팀 ${blue}점, 홍팀 ${red}점`}
      >
        <m.span
          className="absolute inset-y-0 left-0 block w-full rounded-full"
          style={{ transformOrigin: 'left center', background: 'var(--blue)' }}
          animate={{ scaleX: blueRatio }}
          transition={transitionFor(motionOk, TWEEN_FLOW)}
        />
      </span>

      <Side label="홍팀" score={red} color="var(--red)" mine={yourTeam === 1} />
    </div>
  )
}

function Side({
  label,
  score,
  color,
  mine,
}: {
  label: string
  score: number
  color: string
  mine: boolean
}) {
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      <span
        className="text-xs font-semibold"
        style={{ color, textDecoration: mine ? 'underline' : 'none' }}
      >
        {label}
      </span>
      <span className="tnum text-sm font-bold" style={{ color: 'var(--text-hi)' }}>
        {score}
      </span>
    </span>
  )
}
