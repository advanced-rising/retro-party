'use client'

import { AnimatePresence, m } from 'motion/react'
import { Lightbulb } from 'lucide-react'
import { SPRING_POP, STAGGER_STEP, transitionFor, useMotionOk } from '@/lib/motion'

export interface ChosungView {
  readonly chosung: string
  readonly length: number
  readonly category: string
  readonly hint: string | null
  readonly firstVowel: string | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

export const isChosungView = (v: unknown): v is ChosungView =>
  typeof v === 'object' && v !== null && 'chosung' in v

/**
 * 초성이 이 게임의 얼굴이다. 한 글자씩 떨어지듯 들어오면
 * "문제가 나왔다"는 순간이 생긴다 — 통째로 나타나면 그냥 텍스트다.
 */
export function ChosungBoard({ view }: { view: ChosungView }) {
  const motionOk = useMotionOk()
  const letters = [...view.chosung]

  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.category} · {view.length}글자
      </p>

      <m.p
        key={view.chosung}
        className="mt-3 flex justify-center gap-3 text-5xl font-bold sm:text-6xl"
        style={{ color: 'var(--text-hi)' }}
        aria-label={`초성 ${letters.join(' ')}`}
        initial="hidden"
        animate="shown"
        variants={{ shown: { transition: { staggerChildren: STAGGER_STEP } } }}
      >
        {letters.map((letter, i) => (
          <m.span
            key={`${letter}-${i}`}
            variants={{
              hidden: { opacity: 0, y: -16, scale: 0.8 },
              shown: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={transitionFor(motionOk, SPRING_POP)}
            aria-hidden
          >
            {letter}
          </m.span>
        ))}
      </m.p>

      <div className="mt-4 flex min-h-10 flex-col items-center gap-1">
        <AnimatePresence>
          {view.hint !== null && (
            <m.p
              key="hint"
              className="flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--text-lo)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transitionFor(motionOk, SPRING_POP)}
            >
              <Lightbulb size={14} aria-hidden />
              {view.hint}
            </m.p>
          )}
          {view.firstVowel !== null && (
            <m.p
              key="vowel"
              className="text-sm"
              style={{ color: 'var(--text-lo)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transitionFor(motionOk, SPRING_POP)}
            >
              첫 글자 모음 <strong style={{ color: 'var(--text-hi)' }}>{view.firstVowel}</strong>
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
