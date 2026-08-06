'use client'

import { m } from 'motion/react'
import { levelProgress, titleFor } from '@retro/room-kit'
import { titleIcon } from '@/lib/game-icon'
import { transitionFor, TWEEN_FLOW, useMotionOk } from '@/lib/motion'

/**
 * 레벨과 칭호 — 10 문서 §1 · §2
 *
 * 레벨은 **떨어지지 않는다.** 실력이 아니라 "얼마나 했나"의 표시라,
 * 콜드스타트 시기에 「뭔가 쌓인다」는 감각이 유일한 잔류 이유가 된다 (10 문서 §7).
 * 그래서 항상 보이는 자리인 헤더에 둔다.
 *
 * 게이지는 width 가 아니라 scaleX 로 움직인다 (모션 규약 1).
 */
export function LevelBadge({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const motionOk = useMotionOk()
  const { level, ratio, toNext } = levelProgress(xp)
  const title = titleFor(level)
  const Icon = titleIcon(title.icon)

  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1"
      style={{ background: 'var(--bg-elevated)' }}
      title={toNext > 0 ? `다음 레벨까지 ${toNext.toLocaleString('ko-KR')}` : '만렙'}
    >
      <Icon size={13} color="var(--gold)" aria-hidden />

      {/* 급·단은 이름이 짧아 좁은 자리에서도 그대로 보여준다 */}
      <span
        className="text-xs font-bold"
        style={{ color: title.kind === 'dan' ? 'var(--gold)' : 'var(--text-hi)' }}
      >
        {title.name}
      </span>

      {!compact && (
        <span className="tnum text-xs" style={{ color: 'var(--text-dim)' }}>
          Lv{level}
        </span>
      )}

      {/* 다음 레벨까지 얼마나 왔는지. 숫자만 있으면 진행감이 안 산다 */}
      <span
        className="h-1 w-6 overflow-hidden rounded-full"
        style={{ background: 'var(--border)' }}
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`레벨 ${level} 진행률`}
      >
        <m.span
          className="block h-full w-full rounded-full"
          style={{ transformOrigin: 'left center', background: 'var(--lime)' }}
          animate={{ scaleX: ratio }}
          transition={transitionFor(motionOk, TWEEN_FLOW)}
        />
      </span>
    </span>
  )
}
