'use client'

import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { useMotionOk } from '@/lib/motion'

/**
 * 정답 순간의 반응.
 *
 * 맞혔다는 사실이 점수 숫자만 바뀌는 걸로는 전달되지 않는다.
 * **화면 전체가 한 번 반응해야** 「내가 맞혔다」가 몸으로 온다.
 *
 * 모두 transform·opacity 로만 만든다 — 조각이 여러 개라 레이아웃을
 * 건드리면 그 순간 프레임이 떨어진다. 조각은 pointer-events 도 없다.
 */

const PIECES = 12

export function CorrectBurst({ trigger }: { trigger: number }) {
  const motionOk = useMotionOk()
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    if (trigger === 0) return
    setShown(trigger)
    const id = setTimeout(() => setShown(null), 900)
    return () => clearTimeout(id)
  }, [trigger])

  if (!motionOk || shown === null) return null

  return (
    <AnimatePresence>
      <div
        key={shown}
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        aria-hidden
      >
        {/* 가운데에서 퍼지는 링 */}
        <m.span
          className="absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2"
          style={{ borderColor: 'var(--lime)', marginLeft: -48, marginTop: -48 }}
          initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />

        {/* 사방으로 튀는 조각 */}
        {Array.from({ length: PIECES }, (_, i) => {
          const angle = (i / PIECES) * Math.PI * 2
          const distance = 110 + (i % 3) * 30
          return (
            <m.span
              key={i}
              className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full"
              style={{
                background: i % 3 === 0 ? 'var(--gold)' : 'var(--lime)',
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                opacity: 0,
                scale: 0.4,
              }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            />
          )
        })}
      </div>
    </AnimatePresence>
  )
}
