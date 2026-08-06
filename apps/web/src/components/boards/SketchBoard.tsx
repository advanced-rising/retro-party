'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Eraser, Pencil, Undo2 } from 'lucide-react'
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

/**
 * 획 색은 컬러 토큰을 쓴다. 다크·라이트에서 알아서 뒤집힌다.
 *
 * ★ **캔버스에는 `var(--x)` 를 그대로 넣을 수 없다.** CSS 가 아니라
 * 2D 컨텍스트라 변수를 모르고, 무효값이면 조용히 기본값(검정)으로 그린다.
 * 그래서 실제 색으로 **풀어서** 넣어야 한다 — resolveColor 가 그 일을 한다.
 * (CSS 속성에는 var() 를 그대로 써도 된다. 색 단추가 그 경우다.)
 */
const COLOR_TOKEN: Readonly<Record<SketchColor, string>> = {
  ink: '--text-hi',
  lime: '--lime',
  blue: '--blue',
  red: '--red',
  amber: '--amber',
}

const COLOR_VAR: Readonly<Record<SketchColor, string>> = {
  ink: 'var(--text-hi)',
  lime: 'var(--lime)',
  blue: 'var(--blue)',
  red: 'var(--red)',
  amber: 'var(--amber)',
}

const COLOR_LABEL: Readonly<Record<SketchColor, string>> = {
  ink: '기본',
  lime: '초록',
  blue: '파랑',
  red: '빨강',
  amber: '노랑',
}

/** 토큰을 지금 테마의 실제 색으로 푼다 */
function resolveColor(el: Element, color: SketchColor): string {
  const value = getComputedStyle(el).getPropertyValue(COLOR_TOKEN[color]).trim()
  return value.length > 0 ? value : '#888888'
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
      ctx.strokeStyle = resolveColor(canvas, stroke.color)
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

  // 테마가 바뀌면 풀어 둔 색이 낡는다. 캔버스는 CSS 처럼 알아서 안 바뀐다
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', repaint)
    return () => media.removeEventListener('change', repaint)
  }, [repaint])

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

      {/* 지금 무엇으로 그리는지. 단추만으로는 확신이 안 선다 */}
      <p
        className="mt-2 flex w-full items-center gap-1.5 text-xs"
        style={{ color: 'var(--text-dim)' }}
      >
        <span
          className="inline-block rounded-full"
          style={{
            width: Math.max(6, width),
            height: Math.max(6, width),
            background: COLOR_VAR[color],
            boxShadow: '0 0 0 1px var(--border)',
          }}
          aria-hidden
        />
        {COLOR_LABEL[color]} · 굵기 {SKETCH_WIDTHS.indexOf(width) + 1}단계
      </p>

      <div className="mt-1.5 flex w-full flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`색 ${COLOR_LABEL[c]}`}
              aria-pressed={color === c}
              title={COLOR_LABEL[c]}
              className="relative flex items-center justify-center rounded-full transition-transform"
              style={{
                width: 26,
                height: 26,
                background: COLOR_VAR[c],
                transform: color === c ? 'scale(1.15)' : 'scale(1)',
                // 고른 색은 링을 두 겹으로 둘러 배경색과 무관하게 보이게 한다
                boxShadow:
                  color === c
                    ? '0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-hi)'
                    : '0 0 0 1px var(--border)',
              }}
            >
              {color === c && (
                <Check size={13} strokeWidth={3.5} color="var(--bg-base)" aria-hidden />
              )}
            </button>
          ))}
        </div>

        <div className="ml-1 flex gap-1">
          {SKETCH_WIDTHS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-label={`굵기 ${i + 1}단계`}
              aria-pressed={width === w}
              title={`굵기 ${i + 1}단계`}
              className="flex items-center justify-center rounded-md border-2"
              style={{
                width: 30,
                height: 26,
                background: width === w ? 'var(--lime-wash)' : 'var(--bg-elevated)',
                borderColor: width === w ? 'var(--lime)' : 'var(--border)',
              }}
            >
              {/* 실제 굵기 그대로 보여준다. 눈으로 비교돼야 고르는 의미가 있다 */}
              <span
                className="rounded-full"
                style={{
                  width: w + 2,
                  height: w + 2,
                  background: width === w ? 'var(--lime)' : 'var(--text-lo)',
                }}
              />
            </button>
          ))}
        </div>

        {/* 손가락으로 누를 수 있는 크기로 키운다 */}
        <button
          type="button"
          onClick={() => onCanvas('undo')}
          className="ml-auto flex size-9 items-center justify-center rounded-md border"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          aria-label="한 획 되돌리기"
          title="되돌리기"
        >
          <Undo2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onCanvas('clear')}
          className="flex size-9 items-center justify-center rounded-md border"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          aria-label="모두 지우기"
          title="모두 지우기"
        >
          <Eraser size={15} aria-hidden />
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
