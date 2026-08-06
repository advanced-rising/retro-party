import type { PlayerId } from './ids.ts'

/**
 * 스케치 — 캐치마인드 계보. 01 문서의 출발점이던 게임이다.
 *
 * **좌표는 0~1 로 정규화한다.** 화면 크기가 제각각이라 픽셀을 그대로 보내면
 * 폰에서 그린 그림이 데스크톱에서 어긋난다. 받는 쪽이 자기 캔버스 크기를 곱한다.
 *
 * 획은 **채팅과 달리 라운드가 끝날 때까지 서버 메모리에 남는다.**
 * 늦게 들어온 사람에게 지금까지 그린 그림을 보여줘야 하기 때문이다.
 * 다만 storage 에는 절대 쓰지 않는다 — 라운드가 끝나면 사라진다.
 */

/** 0~1 정규화 좌표 */
export interface SketchPoint {
  readonly x: number
  readonly y: number
}

export const SKETCH_COLORS = ['ink', 'lime', 'blue', 'red', 'amber'] as const
export type SketchColor = (typeof SKETCH_COLORS)[number]

export const SKETCH_WIDTHS = [2, 6, 14] as const
export type SketchWidth = (typeof SKETCH_WIDTHS)[number]

export interface SketchStroke {
  readonly by: PlayerId
  readonly color: SketchColor
  readonly width: SketchWidth
  /** 이어 그리는 점들. 한 번 누르고 뗄 때까지가 한 획 */
  readonly points: readonly SketchPoint[]
}

/** 한 획에 담을 수 있는 점의 수. 넘으면 클라이언트가 나눠 보낸다 */
export const MAX_STROKE_POINTS = 400
/** 한 라운드에 남길 획 수. 넘으면 오래된 것부터 버린다 */
export const MAX_STROKES = 600

export const isSketchColor = (v: unknown): v is SketchColor =>
  typeof v === 'string' && (SKETCH_COLORS as readonly string[]).includes(v)

export const isSketchWidth = (v: unknown): v is SketchWidth =>
  typeof v === 'number' && (SKETCH_WIDTHS as readonly number[]).includes(v)

const isPoint = (v: unknown): v is SketchPoint => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p['x'] === 'number' &&
    typeof p['y'] === 'number' &&
    Number.isFinite(p['x']) &&
    Number.isFinite(p['y'])
  )
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 신뢰할 수 없는 입력. 좌표를 0~1 로 강제하고 개수를 자른다 */
export function parseStrokePoints(raw: unknown): readonly SketchPoint[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const points = raw
    .filter(isPoint)
    .slice(0, MAX_STROKE_POINTS)
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
  return points.length > 0 ? points : null
}
