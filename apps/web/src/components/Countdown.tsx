'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

/**
 * 시작 카운트다운 — 3 · 2 · 1.
 *
 * 이 3초가 "이제 시작한다"는 긴장을 만든다. 글자만 바꾸면 아무 일도 안 일어난 것
 * 같아서, 숫자가 크게 들어왔다가 빠져나가게 한다.
 *
 * `prefers-reduced-motion` 은 globals.css 에서 전역으로 꺼진다.
 */
export function Countdown({ startsAtMs }: { startsAtMs: number }) {
  const [remain, setRemain] = useState(() => Math.ceil((startsAtMs - Date.now()) / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setRemain(Math.ceil((startsAtMs - Date.now()) / 1000))
    }, 100)
    return () => clearInterval(id)
  }, [startsAtMs])

  const label = remain > 0 ? String(remain) : '시작'

  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={label}
          initial={{ scale: 1.9, opacity: 0, filter: 'blur(8px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          exit={{ scale: 0.5, opacity: 0, filter: 'blur(6px)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.6 }}
          className="tnum block text-6xl font-bold leading-none"
          style={{ color: remain > 0 ? 'var(--text-hi)' : 'var(--lime)' }}
        >
          {label}
        </motion.span>
      </AnimatePresence>

      <motion.span
        className="text-sm"
        style={{ color: 'var(--text-dim)' }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        곧 시작합니다
      </motion.span>
    </div>
  )
}
