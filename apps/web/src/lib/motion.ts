'use client'

import { useReducedMotion, type Transition, type Variants } from 'motion/react'

/**
 * 모션 규약 — 06 문서 §9
 *
 * 애니메이션을 컴포넌트마다 손으로 적으면 반드시 제각각이 된다.
 * 여기서 한 번 정하고 전부 여기서 가져다 쓴다.
 *
 * 지키는 규칙 세 가지.
 *
 *   1. **GPU 속성만 움직인다** — transform · opacity · filter.
 *      width/height/top/left 를 움직이면 매 프레임 레이아웃을 다시 계산한다.
 *      게이지 바도 width 가 아니라 scaleX 로 움직인다.
 *
 *   2. **prefers-reduced-motion 을 JS 에서도 본다.**
 *      globals.css 의 transition-duration 규칙은 CSS 애니메이션만 막는다.
 *      Motion 은 인라인 스타일을 직접 쓰므로 CSS 로는 안 멈춘다 — 훅으로 꺼야 한다.
 *
 *   3. **스프링을 기본으로.** 이 게임은 물리적인 감각이 필요하다 —
 *      숫자가 튀고, 순위가 밀리고, 정답이 터진다. 선형 이징으로는 그게 안 난다.
 */

/**
 *   4. **가만히 있는 것은 움직이지 않는다.**
 *      무한 반복 펄스(깜빡임·맥박)를 여러 군데 두면 화면 전체가 울렁거려서
 *      읽히지 않는다. 모션은 **상태가 바뀌는 순간**에만 쓴다.
 *      값 자체를 스프링으로 굴리는 것도 같은 이유로 안 한다 —
 *      점수는 즉시 바뀌고, 오른 사실만 한 번 튄다.
 *
 *   5. **blur 를 남발하지 않는다.** 흐물거려 보이고 합성 비용도 크다.
 */

/** 카운트다운 숫자처럼 크게 튕겨야 하는 것 */
export const SPRING_POP: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 24,
  mass: 0.6,
}

/** 순위 이동처럼 묵직하게 자리를 잡아야 하는 것 */
export const SPRING_SETTLE: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 32,
}

/** 게이지처럼 계속 흐르는 것. 스프링이면 출렁여서 시간이 왜곡돼 보인다 */
export const TWEEN_FLOW: Transition = { duration: 0.15, ease: 'linear' }

/** 채팅 줄처럼 자주·많이 생기는 것. 가볍고 짧게 */
export const TWEEN_QUICK: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] }

/** 목록이 순서대로 들어올 때의 간격 */
export const STAGGER_STEP = 0.05

/**
 * 모션을 써도 되는가.
 *
 * false 면 각 컴포넌트가 애니메이션을 **끄는** 게 아니라 **즉시 끝난 상태**로
 * 그려야 한다. 초기값에 멈춰 있으면 화면이 비어 보인다.
 */
export function useMotionOk(): boolean {
  return useReducedMotion() !== true
}

/** 모션이 꺼졌을 때 쓰는 전이 — 0초. 상태는 정상적으로 반영된다 */
export const INSTANT: Transition = { duration: 0 }

export function transitionFor(motionOk: boolean, transition: Transition): Transition {
  return motionOk ? transition : INSTANT
}

/** 아래에서 살짝 올라오며 나타나는 기본 등장 */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
}

/** 자식을 순서대로 등장시키는 부모 */
export const stagger: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: STAGGER_STEP } },
}

/** 정답을 맞혔을 때 터지는 느낌 — scale 과 opacity 만 쓴다 */
export const burst: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  shown: { opacity: 1, scale: 1 },
}
