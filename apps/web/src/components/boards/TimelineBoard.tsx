'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Send } from 'lucide-react'
import { Reorder, useDragControls } from 'motion/react'
import { useMotionOk } from '@/lib/motion'

export interface TimelineView {
  readonly title: string
  readonly events: readonly string[]
  readonly solvedCount: number
  readonly youSolved: boolean
}

export const isTimelineView = (v: unknown): v is TimelineView =>
  typeof v === 'object' && v !== null && 'title' in v && 'events' in v

/**
 * 연표 정렬 — 이 게임만 유일하게 **드래그**로 조작한다.
 *
 * 답을 보내는 통로는 그대로 채팅이다. 카드를 옮긴 순서를 `13245` 로 바꿔
 * 보내므로, 손이 불편한 사람은 채팅창에 직접 쳐도 똑같이 동작한다.
 * 드래그는 편의이지 유일한 입력이 아니다.
 */
export function TimelineBoard({
  view,
  onSubmit,
}: {
  view: TimelineView
  onSubmit: (order: string) => void
}) {
  const motionOk = useMotionOk()
  const [items, setItems] = useState<readonly number[]>(() => view.events.map((_, i) => i))

  // 새 문제가 오면 순서를 처음 상태로 되돌린다
  useEffect(() => {
    setItems(view.events.map((_, i) => i))
  }, [view.events])

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    setItems(next)
  }

  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.title} · 오래된 것부터 위로
      </p>

      <Reorder.Group
        axis="y"
        values={[...items]}
        onReorder={setItems}
        className="mt-3 w-full space-y-1.5"
        as="ol"
      >
        {items.map((index, position) => (
          <Row
            key={index}
            value={index}
            position={position}
            total={items.length}
            text={view.events[index] ?? ''}
            draggable={motionOk}
            onMove={move}
          />
        ))}
      </Reorder.Group>

      <button
        type="button"
        onClick={() => onSubmit(items.map((i) => i + 1).join(''))}
        disabled={view.youSolved}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold disabled:opacity-40"
        style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
      >
        <Send size={14} aria-hidden />
        이 순서로 제출
      </button>

      <p className="mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
        거의 맞춰도 점수를 받습니다. 채팅에 {items.map((i) => i + 1).join('')} 처럼 쳐도 됩니다
      </p>
    </>
  )
}

function Row({
  value,
  position,
  total,
  text,
  draggable,
  onMove,
}: {
  value: number
  position: number
  total: number
  text: string
  draggable: boolean
  onMove: (from: number, to: number) => void
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={value}
      dragListener={draggable}
      dragControls={controls}
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left"
      style={{ background: 'var(--bg-elevated)', cursor: draggable ? 'grab' : 'default' }}
      as="li"
    >
      <span className="tnum w-4 shrink-0 text-xs font-semibold" style={{ color: 'var(--lime)' }}>
        {position + 1}
      </span>
      <span className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text-hi)' }}>
        {text}
      </span>

      {/* 드래그가 어려운 환경을 위한 대체 조작 */}
      <span className="flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onMove(position, position - 1)}
          disabled={position === 0}
          className="rounded p-1 disabled:opacity-30"
          aria-label="위로"
        >
          <ArrowUp size={12} color="var(--text-lo)" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove(position, position + 1)}
          disabled={position === total - 1}
          className="rounded p-1 disabled:opacity-30"
          aria-label="아래로"
        >
          <ArrowDown size={12} color="var(--text-lo)" aria-hidden />
        </button>
      </span>
    </Reorder.Item>
  )
}
