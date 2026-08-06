'use client'

import { Infinity as InfinityIcon } from 'lucide-react'
import type { RoomPhase } from '@retro/types'

/**
 * 몇 라운드째인가 — 06 문서 목업의 `R4/10`.
 *
 * 이게 없으면 판이 언제 끝나는지 모른다. 「이번이 마지막이구나」를 알아야
 * 마지막 라운드에 힘이 들어가고, 무제한이면 무제한인 줄 알아야 한다.
 */
export function RoundBadge({ phase, rounds }: { phase: RoomPhase; rounds: number }) {
  const current =
    phase.kind === 'playing' || phase.kind === 'reveal' ? phase.roundNo + 1 : null
  if (current === null) return null

  const unlimited = rounds <= 0
  const last = !unlimited && current >= rounds

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold"
      style={{
        background: last ? 'var(--lime-wash)' : 'var(--bg-elevated)',
        borderColor: last ? 'var(--lime)' : 'var(--border)',
        color: last ? 'var(--lime)' : 'var(--text-lo)',
      }}
      title={unlimited ? '무제한 — 사람이 남아 있는 한 계속' : last ? '마지막 라운드' : undefined}
    >
      <span className="tnum">{current}</span>
      {unlimited ? (
        <InfinityIcon size={12} aria-label="무제한" />
      ) : (
        <span className="tnum" style={{ opacity: 0.7 }}>
          /{rounds}
        </span>
      )}
    </span>
  )
}
