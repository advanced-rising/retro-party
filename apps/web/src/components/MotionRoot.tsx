'use client'

import { LazyMotion, domAnimation } from 'motion/react'

/**
 * Motion 기능 로더.
 *
 * `motion/react` 를 통째로 쓰면 첫 번들에 34KB 가 들어온다. LazyMotion 에
 * 필요한 기능만 실어 주면 `m` 컴포넌트는 훨씬 가볍게 시작한다.
 * 그래서 이 앱은 `motion.div` 대신 **`m.div`** 를 쓴다 — 섞어 쓰면 이득이 사라진다.
 *
 * domAnimation 에는 이 게임이 쓰는 것(transform · opacity · filter · variants ·
 * AnimatePresence · layout)이 전부 들어 있다. 드래그·3D 가 필요해지면 domMax 로 올린다.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}
