'use client'

import { m } from 'motion/react'
import { SPRING_POP, transitionFor, useMotionOk } from '@/lib/motion'

export interface OxView {
  readonly text: string
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly youAnswered: boolean
}

export const isOxView = (v: unknown): v is OxView =>
  typeof v === 'object' && v !== null && 'text' in v && 'youAnswered' in v

/**
 * 스피드 OX — 10초.
 *
 * 버튼 두 개가 화면의 절반을 차지한다. 생각하지 말고 누르라는 뜻이다.
 * 채팅에 O / X 를 쳐도 똑같이 동작한다 — 버튼은 편의일 뿐이다.
 */
export function OxBoard({ view, onAnswer }: { view: OxView; onAnswer: (v: string) => void }) {
  const motionOk = useMotionOk()

  return (
    <>
      <m.p
        key={view.text}
        className="min-h-14 text-lg font-semibold leading-relaxed"
        style={{ color: 'var(--text-hi)' }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transitionFor(motionOk, SPRING_POP)}
      >
        {view.text}
      </m.p>

      <div className="mt-4 flex w-full gap-3">
        {(['O', 'X'] as const).map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onAnswer(label)}
            disabled={view.youAnswered}
            className="flex-1 rounded-xl border-2 py-6 text-3xl font-bold disabled:opacity-35"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: label === 'O' ? 'var(--lime)' : 'var(--red)',
              color: label === 'O' ? 'var(--lime)' : 'var(--red)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view.youAnswered && !view.youSolved && (
        <p className="mt-2 text-sm" style={{ color: 'var(--red)' }}>
          아쉽네요. 다음 문제를 기다려 주세요
        </p>
      )}
    </>
  )
}
