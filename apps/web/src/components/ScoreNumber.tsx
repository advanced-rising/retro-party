'use client'

import { AnimatePresence, m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { SPRING_POP, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 점수.
 *
 * 처음에는 스프링으로 값을 굴렸는데 숫자가 계속 흔들려서 읽히지 않았다.
 * **숫자는 즉시 바뀌고, 오른 순간에만 한 번 튄다.** 얼마나 올랐는지는
 * 옆에 뜨는 `+120` 이 알려준다 — 값 자체를 애니메이션할 이유가 없다.
 */
export function ScoreNumber({ value, highlight }: { value: number; highlight: boolean }) {
  const motionOk = useMotionOk()
  const previous = useRef(value)
  const [gain, setGain] = useState<{ amount: number; at: number } | null>(null)

  useEffect(() => {
    const delta = value - previous.current
    previous.current = value
    if (delta <= 0) return

    setGain({ amount: delta, at: Date.now() })
    const id = setTimeout(() => setGain(null), 900)
    return () => clearTimeout(id)
  }, [value])

  return (
    <span className="relative flex shrink-0 items-center">
      <AnimatePresence>
        {gain !== null && motionOk && (
          <m.span
            key={gain.at}
            className="tnum pointer-events-none absolute right-0 text-xs font-bold"
            style={{ color: 'var(--lime)' }}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: -15 }}
            exit={{ opacity: 0, y: -22 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            +{gain.amount}
          </m.span>
        )}
      </AnimatePresence>

      <m.span
        className="tnum text-sm font-semibold"
        style={{ color: highlight ? 'var(--gold)' : 'var(--text-lo)' }}
        animate={{ scale: gain !== null && motionOk ? 1.15 : 1 }}
        transition={transitionFor(motionOk, SPRING_POP)}
      >
        {value.toLocaleString('ko-KR')}
      </m.span>
    </span>
  )
}
