'use client'

import { m } from 'motion/react'
import { SPRING_POP, transitionFor, useMotionOk } from '@/lib/motion'

export interface BaseballView {
  readonly digits: number
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly tries: number
}

export const isBaseballView = (v: unknown): v is BaseballView =>
  typeof v === 'object' && v !== null && 'digits' in v && 'tries' in v

/**
 * 숫자 야구 — 화면에 보여줄 문제가 없는 유일한 게임.
 *
 * 문제는 서버 안에만 있고, 화면이 하는 일은 「몇 자리인지」와
 * 「내가 몇 번 던졌는지」를 알려주는 것뿐이다. 나머지는 전부 채팅에서
 * 오가는 판정(2스트라이크 1볼)이 만든다 — 그게 이 게임의 판이다.
 */
export function BaseballBoard({ view }: { view: BaseballView }) {
  const motionOk = useMotionOk()

  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        서로 다른 숫자 {view.digits}개를 맞히세요
      </p>

      <div className="mt-3 flex justify-center gap-2">
        {Array.from({ length: view.digits }, (_, i) => (
          <m.span
            key={i}
            className="flex items-center justify-center rounded-lg border-2 text-3xl font-bold"
            style={{
              width: 52,
              height: 64,
              borderColor: 'var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-dim)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transitionFor(motionOk, SPRING_POP), delay: i * 0.06 }}
          >
            ?
          </m.span>
        ))}
      </div>

      <p className="mt-4 text-sm" style={{ color: 'var(--text-lo)' }}>
        채팅에 <strong style={{ color: 'var(--text-hi)' }}>숫자 {view.digits}자리</strong>를 치면
        판정이 돌아옵니다
      </p>

      <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
        자리까지 맞으면 <strong style={{ color: 'var(--lime)' }}>스트라이크</strong>, 숫자만 있으면{' '}
        <strong style={{ color: 'var(--amber)' }}>볼</strong>
      </p>

      {view.tries > 0 && (
        <p className="tnum mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
          {view.tries}번 던졌습니다
        </p>
      )}
    </>
  )
}
