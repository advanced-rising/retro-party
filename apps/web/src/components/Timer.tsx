'use client'

import { m } from 'motion/react'
import { useEffect, useState } from 'react'
import { TWEEN_FLOW, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 타이머 바 — 06 문서 §2.4
 *
 * 라임은 세 자리에만 쓴다. 여기가 그 중 하나다.
 * 남은 시간이 25% 아래로 내려가면 앰버로 바뀌고 숫자가 뛴다.
 *
 * **width 가 아니라 scaleX 로 줄인다.** width 를 매 프레임 바꾸면 그때마다
 * 레이아웃을 다시 계산한다. scaleX 는 합성 단계에서만 처리돼 공짜에 가깝다.
 */
export function Timer({ endsAtMs, totalMs }: { endsAtMs: number; totalMs: number }) {
  const motionOk = useMotionOk()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  const remain = Math.max(0, endsAtMs - now)
  const ratio = totalMs > 0 ? Math.min(1, remain / totalMs) : 0
  const urgent = ratio < 0.25
  const seconds = Math.ceil(remain / 1000)
  void motionOk

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--bg-elevated)' }}
        role="progressbar"
        aria-valuenow={seconds}
        aria-valuemin={0}
        aria-valuemax={Math.ceil(totalMs / 1000)}
        aria-label="남은 시간"
      >
        <m.div
          className="h-full w-full rounded-full"
          style={{ transformOrigin: 'left center' }}
          animate={{
            scaleX: ratio,
            backgroundColor: urgent ? 'var(--amber)' : 'var(--lime)',
          }}
          transition={transitionFor(motionOk, TWEEN_FLOW)}
        />
      </div>

      {/* 숫자를 계속 뛰게 하면 읽히지 않는다. 색만 바뀌고 자리는 고정 */}
      <span
        className="tnum w-8 text-right text-sm font-semibold tabular-nums transition-colors"
        style={{ color: urgent ? 'var(--amber)' : 'var(--text-lo)' }}
      >
        {seconds}
      </span>
    </div>
  )
}
