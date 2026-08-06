'use client'

import { LazyMotion, domMax } from 'motion/react'

/**
 * Motion 기능 로더.
 *
 * `motion/react` 를 통째로 쓰면 첫 번들에 34KB 가 들어온다. LazyMotion 에
 * 필요한 기능만 실어 주면 `m` 컴포넌트는 훨씬 가볍게 시작한다.
 * 그래서 이 앱은 `motion.div` 대신 **`m.div`** 를 쓴다 — 섞어 쓰면 이득이 사라진다.
 *
 * 연표 정렬이 드래그(Reorder)를 쓰기 때문에 domMax 가 필요하다.
 * domAnimation 으로는 드래그가 동작하지 않는다 — 그 기능이 안 들어 있다.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  )
}
