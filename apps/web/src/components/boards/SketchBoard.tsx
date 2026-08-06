'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Pencil, Undo2 } from 'lucide-react'
import {
  SKETCH_COLORS,
  SKETCH_WIDTHS,
  type PlayerId,
  type SketchColor,
  type SketchStroke,
  type SketchWidth,
} from '@retro/types'

export interface SketchDrawerView {
  readonly role: 'drawer'
  readonly word: string
  readonly category: string
  readonly solvedCount: number
}

export interface SketchGuesserView {
  readonly role: 'guesser'
  readonly category: string
  readonly length: number
  readonly presenter: PlayerId | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

export type SketchView = SketchDrawerView | SketchGuesserView

export const isSketchView = (v: unknown): v is SketchView =>
  typeof v === 'object' &&
  v !== null &&
  ((v as { role?: unknown }).role === 'drawer' || (v as { role?: unknown }).role === 'guesser')

/** 획 색은 토큰을 그대로 쓴다. 다크·라이트에서 알아서 뒤집힌다 */
const COLOR_VAR: Readonly<Record<SketchColor, string>> = {
  ink: 'var(--text-hi)',
  lime: 'var(--lime)',
  blue: 'var(--blue)',
  red: 'var(--red)',
  amber: 'var(--amber)',
}

/** 한 번에 몰아 보낼 점의 수. 점마다 보내면 소켓이 터진다 */
const BATCH_POINTS = 8

/**
 * 스케치 — 캐치마인드 계보.
 *
 * 좌표는 **0~1 정규화**로 주고받는다. 폰에서 그린 그림이 데스크톱에서
 * 그대로 재현되려면 픽셀이 아니라 비율이어야 한다.
 *
 * 그리는 사람만 캔버스에 손을 댈 수 있다. 다만 **막는 것은 서버가 한다** —
 * 여기서 숨기는 건 편의일 뿐이고, 소켓으로 직접 보내면 그만이기 때문이다.
 */
export function SketchBoard({
  view,
  strokes,
  presenterName,
  onStroke,
  onCanvas,
}: {
  view: SketchView
  strokes: readonly SketchStroke[]
  presenterName: string
  onStroke: (s: { color: string; width: number; points: readonly { x: number; y: number }[] }) => void
  onCanvas: (action: 'clear' | 'undo') => void
}) {
  const drawing = view.role === 'drawer'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [color, setColor] = useState<SketchColor>('ink')
  const [width, setWidth] = useState<SketchWidth>(6)

  /** 아직 서버로 안 보낸, 지금 긋고 있는 점들 */
  const pending = useRef<{ x: number; y: number }[]>([])
  const active = useRef(false)

  const repaint = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const paint = (stroke: {
      color: SketchColor
      width: number
      points: readonly { x: number; y: number }[]
    }): void => {
      if (stroke.points.length === 0) return
      ctx.beginPath()
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--stroke-' + stroke.color) ||
        COLOR_VAR[stroke.color]
      ctx.lineWidth = stroke.width * (w / 600)
      const first = stroke.points[0]
      if (first === undefined) return
      ctx.moveTo(first.x * w, first.y * h)
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x * w, p.y * h)
      if (stroke.points.length === 1) ctx.lineTo(first.x * w + 0.1, first.y * h)
      ctx.stroke()
    }

    for (const stroke of strokes) paint(stroke)
    if (pending.current.length > 0) paint({ color, width, points: pending.current })
  }, [strokes, color, width])

  // 캔버스 크기를 컨테이너에 맞춘다. 비율은 항상 3:2
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      repaint()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [repaint])

  useEffect(repaint, [repaint])

  const toNormalized = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const flush = (): void => {
    if (pending.current.length === 0) return
    onStroke({ color, width, points: pending.current })
    // 마지막 점을 남겨 이어 그린 획이 끊겨 보이지 않게 한다
    const last = pending.current.at(-1)
    pending.current = last === undefined ? [] : [last]
  }

  if (!drawing) {
    return (
      <>
        <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
          {view.presenter === null ? '그리는 중' : `${presenterName} 님이 그리는 중`}
        </p>
        <Canvas ref={canvasRef} interactive={false} />
        <p className="mt-2 text-sm" style={{ color: 'var(--text-lo)' }}>
          {view.category} · {view.length}글자
        </p>
      </>
    )
  }

  return (
    <>
      <p
        className="flex items-center justify-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--purple)' }}
      >
        <Pencil size={13} aria-hidden />
        당신이 그립니다
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
        {view.word}
      </p>

      <Canvas
        ref={canvasRef}
        interactive
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          active.current = true
          pending.current = [toNormalized(e)]
          repaint()
        }}
        onPointerMove={(e) => {
          if (!active.current) return
          pending.current.push(toNormalized(e))
          if (pending.current.length >= BATCH_POINTS) flush()
          repaint()
        }}
        onPointerUp={() => {
          if (!active.current) return
          active.current = false
          flush()
          pending.current = []
          repaint()
        }}
      />

      <div className="mt-2 flex w-full items-center gap-2">
        <div className="flex gap-1">
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`색 ${c}`}
              className="size-6 rounded-full border-2"
              style={{
                background: COLOR_VAR[c],
                borderColor: color === c ? 'var(--text-hi)' : 'transparent',
              }}
            />
          ))}
        </div>

        <div className="flex gap-1">
          {SKETCH_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-label={`굵기 ${w}`}
              className="flex size-6 items-center justify-center rounded-md border"
              style={{
                background: width === w ? 'var(--lime-wash)' : 'var(--bg-elevated)',
                borderColor: width === w ? 'var(--lime)' : 'var(--border)',
              }}
            >
              <span
                className="rounded-full"
                style={{
                  width: Math.max(3, w * 0.9),
                  height: Math.max(3, w * 0.9),
                  background: width === w ? 'var(--lime)' : 'var(--text-lo)',
                }}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onCanvas('undo')}
          className="ml-auto rounded-md border p-1.5"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          aria-label="한 획 되돌리기"
        >
          <Undo2 size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onCanvas('clear')}
          className="rounded-md border p-1.5"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          aria-label="모두 지우기"
        >
          <Eraser size={14} aria-hidden />
        </button>
      </div>
    </>
  )
}

const Canvas = ({
  ref,
  interactive,
  ...handlers
}: {
  ref: React.Ref<HTMLCanvasElement>
  interactive: boolean
} & React.ComponentProps<'canvas'>) => (
  <canvas
    ref={ref}
    className="mt-3 w-full rounded-lg border"
    style={{
      aspectRatio: '3 / 2',
      background: 'var(--bg-base)',
      touchAction: interactive ? 'none' : 'auto',
      cursor: interactive ? 'crosshair' : 'default',
    }}
    {...handlers}
  />
)
