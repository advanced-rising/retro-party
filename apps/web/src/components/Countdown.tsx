'use client'

import { AnimatePresence, m } from 'motion/react'
import { useEffect, useState } from 'react'
import { SPRING_POP, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 시작 카운트다운 — 3 · 2 · 1.
 *
 * 이 3초가 "이제 시작한다"는 긴장을 만든다. 글자만 바꾸면 아무 일도 안 일어난 것
 * 같아서, 숫자가 크게 들어왔다가 빠져나가고 뒤에서 링이 줄어든다.
 * 링은 stroke-dashoffset 대신 **회전+스케일**만 쓴다 (GPU 속성).
 */
export function Countdown({ startsAtMs }: { startsAtMs: number }) {
  const motionOk = useMotionOk()
  const [remain, setRemain] = useState(() => secondsLeft(startsAtMs))

  useEffect(() => {
    const id = setInterval(() => setRemain(secondsLeft(startsAtMs)), 80)
    return () => clearInterval(id)
  }, [startsAtMs])

  const label = remain > 0 ? String(remain) : '시작'
  const done = remain <= 0

  return (
    <div className="relative flex flex-col items-center gap-2">
      {/* 숫자가 바뀔 때마다 파문이 한 번 퍼진다 */}
      {motionOk && (
        <AnimatePresence>
          <m.span
            key={`ring-${label}`}
            className="pointer-events-none absolute top-0 h-20 w-20 rounded-full border-2"
            style={{ borderColor: done ? 'var(--lime)' : 'var(--border)' }}
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 1.8, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </AnimatePresence>
      )}

      <AnimatePresence mode="popLayout">
        <m.span
          key={label}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={transitionFor(motionOk, SPRING_POP)}
          className="tnum relative block text-6xl font-bold leading-none"
          style={{ color: done ? 'var(--lime)' : 'var(--text-hi)' }}
        >
          {label}
        </m.span>
      </AnimatePresence>

      {/* 깜빡이게 하면 눈이 피로하다. 숫자가 이미 움직이고 있다 */}
      <span className="text-sm" style={{ color: 'var(--text-dim)' }}>
        {done ? '' : '곧 시작합니다'}
      </span>
    </div>
  )
}

const secondsLeft = (startsAtMs: number): number =>
  Math.ceil((startsAtMs - Date.now()) / 1000)
