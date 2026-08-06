'use client'

import { AnimatePresence, m } from 'motion/react'
import { SPRING_POP, STAGGER_STEP, transitionFor, useMotionOk } from '@/lib/motion'

export interface KkungttaView {
  readonly chain: readonly string[]
  readonly nextChar: string
  readonly wordLength: number
  readonly solvedCount: number
  readonly youSolved: boolean
}

export const isKkungttaView = (v: unknown): v is KkungttaView =>
  typeof v === 'object' && v !== null && 'chain' in v && 'nextChar' in v

/**
 * 쿵쿵따 — 사슬이 자라는 걸 눈으로 보여준다.
 *
 * 이 게임의 재미는 「얼마나 길게 이었는가」라서, 지나온 단어가 옆으로
 * 쌓이고 새 단어가 톡 붙는 게 화면의 전부다.
 */
export function KkungttaBoard({ view }: { view: KkungttaView }) {
  const motionOk = useMotionOk()
  const recent = view.chain.slice(-8)

  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.wordLength}글자로 이어 가세요 · {view.chain.length}개째
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <AnimatePresence initial={false}>
          {recent.map((word, i) => (
            <m.span
              key={`${word}-${view.chain.length - recent.length + i}`}
              layout={motionOk}
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: i === recent.length - 1 ? 1 : 0.55, scale: 1, y: 0 }}
              transition={{ ...transitionFor(motionOk, SPRING_POP), delay: i * STAGGER_STEP * 0.3 }}
              className="rounded-lg px-2.5 py-1 text-sm font-semibold"
              style={{
                background: i === recent.length - 1 ? 'var(--lime-wash)' : 'var(--bg-elevated)',
                color: i === recent.length - 1 ? 'var(--lime)' : 'var(--text-lo)',
              }}
            >
              {word}
            </m.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-baseline justify-center gap-2">
        <m.span
          key={view.nextChar}
          className="text-5xl font-bold"
          style={{ color: 'var(--text-hi)' }}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={transitionFor(motionOk, SPRING_POP)}
        >
          {view.nextChar}
        </m.span>
        <span className="text-2xl font-bold" style={{ color: 'var(--text-dim)' }}>
          ○ ○
        </span>
      </div>

      <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
        이 글자로 시작하는 세 글자 단어
      </p>
    </>
  )
}
