'use client'

import { useEffect, useState } from 'react'

/**
 * 타이머 바 — 06 문서 §2.4
 *
 * 라임은 세 자리에만 쓴다. 여기가 그 중 하나다.
 * 남은 시간이 25% 아래로 내려가면 앰버로 바뀐다.
 */
export function Timer({ endsAtMs, totalMs }: { endsAtMs: number; totalMs: number }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [])

  const remain = Math.max(0, endsAtMs - now)
  const ratio = totalMs > 0 ? Math.min(1, remain / totalMs) : 0
  const urgent = ratio < 0.25

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--bg-elevated)' }}
        role="progressbar"
        aria-valuenow={Math.ceil(remain / 1000)}
        aria-valuemin={0}
        aria-valuemax={Math.ceil(totalMs / 1000)}
        aria-label="남은 시간"
      >
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${ratio * 100}%`,
            background: urgent ? 'var(--amber)' : 'var(--lime)',
          }}
        />
      </div>
      <span
        className="tnum w-8 text-right text-sm font-semibold"
        style={{ color: urgent ? 'var(--amber)' : 'var(--text-lo)' }}
      >
        {Math.ceil(remain / 1000)}
      </span>
    </div>
  )
}
