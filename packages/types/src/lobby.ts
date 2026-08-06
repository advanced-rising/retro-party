import type { GameId, RoomCode } from './ids.ts'
import type { RoomMode } from './room.ts'

/**
 * 방 목록 — 03 문서 §4
 *
 * 목록은 공개되지만 정렬은 자유롭지 않다. **사람 수 내림차순 고정**이고
 * 빈 방은 띄우지 않는다. 목록을 훑다가 빈 방을 새로 만드는 순간
 * 동접 10명이 방 8개가 된다.
 */

export interface RoomSummary {
  readonly code: RoomCode
  readonly title: string
  readonly gameId: GameId
  readonly mode: RoomMode
  /** 지금 접속해 있는 사람 수 */
  readonly players: number
  readonly capacity: number
  readonly phase: 'lobby' | 'countdown' | 'playing' | 'reveal' | 'result'
  /** 비밀번호가 걸린 방. 자물쇠로 표시한다 */
  readonly locked: boolean
  readonly updatedAtMs: number
}

/** 이 시간 동안 갱신이 없으면 죽은 방으로 보고 목록에서 지운다 */
export const ROOM_STALE_MS = 45_000

/**
 * 목록 정렬 — 사람이 많은 방이 항상 위다.
 * "최근 만들어진 순" 으로 두면 빈 새 방이 맨 위에 오고, 그게 분산을 만든다.
 */
export function sortRooms(rooms: readonly RoomSummary[]): readonly RoomSummary[] {
  return [...rooms].sort((a, b) => b.players - a.players || b.updatedAtMs - a.updatedAtMs)
}

/** 목록에 띄울 방. 빈 방과 죽은 방은 뺀다 */
export function listableRooms(
  rooms: readonly RoomSummary[],
  nowMs: number,
): readonly RoomSummary[] {
  return sortRooms(
    rooms.filter((r) => r.players > 0 && nowMs - r.updatedAtMs < ROOM_STALE_MS),
  )
}

/**
 * [바로 참가] 가 고를 방 — 03 문서 §4.3
 * 가장 사람 많고 자리가 남은 공개 방. 비밀번호 방은 고르지 않는다.
 */
export function pickQuickJoin(
  rooms: readonly RoomSummary[],
  nowMs: number,
): RoomSummary | null {
  const open = listableRooms(rooms, nowMs).filter(
    (r) => !r.locked && r.players < r.capacity && r.phase !== 'result',
  )
  return open[0] ?? null
}
