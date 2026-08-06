'use client'

import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'

export interface GeuhaeView {
  readonly hints: readonly string[]
  readonly totalHints: number
  /** 다음 힌트가 열리는 절대 시각. 없으면 null */
  readonly nextHintAtMs: number | null
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly usedNear: boolean
}

export const isGeuhaeView = (v: unknown): v is GeuhaeView =>
  typeof v === 'object' && v !== null && 'hints' in v && 'totalHints' in v

/**
 * 힌트는 어려운 것부터 열린다. 일찍 맞힐수록 점수가 높다 — 02 문서 §1.1
 *
 * 카운트다운은 서버가 준 **절대 시각**을 기준으로 클라이언트가 직접 센다.
 * 서버가 밀어주는 주기(1초)에 묶으면 숫자가 툭툭 끊겨서 안 보인다.
 */
export function GeuhaeBoard({ view }: { view: GeuhaeView }) {
  const remain = useCountdown(view.nextHintAtMs)

  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        몇 년도일까요
      </p>

      <ol className="mt-3 w-full space-y-1.5 text-left">
        <AnimatePresence initial={false}>
          {view.hints.map((hint, i) => (
            <m.li
              key={hint}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="flex gap-2.5 text-sm"
              style={{ color: 'var(--text)' }}
            >
              <span className="tnum shrink-0 font-semibold" style={{ color: 'var(--text-dim)' }}>
                {i + 1}
              </span>
              {hint}
            </m.li>
          ))}
        </AnimatePresence>
      </ol>

      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="flex gap-1" aria-label={`힌트 ${view.hints.length}/${view.totalHints}`}>
          {Array.from({ length: view.totalHints }, (_, i) => (
            <m.span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              animate={{ backgroundColor: i < view.hints.length ? 'var(--lime)' : 'var(--border)' }}
              transition={{ duration: 0.25 }}
            />
          ))}
        </span>

        {remain !== null && (
          <span className="tnum text-xs" style={{ color: 'var(--text-dim)' }}>
            다음 힌트 {remain}초
          </span>
        )}
      </div>

      {view.usedNear && (
        <p className="mt-2 text-xs" style={{ color: 'var(--amber)' }}>
          한 해 차이로 아까웠습니다. 부분 점수는 한 번뿐이에요
        </p>
      )}
    </>
  )
}

/** 절대 시각까지 남은 초. 자기 시계로 세므로 서버 주기와 무관하다 */
function useCountdown(targetMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (targetMs === null) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [targetMs])

  if (targetMs === null) return null
  return Math.max(0, Math.ceil((targetMs - now) / 1000))
}
