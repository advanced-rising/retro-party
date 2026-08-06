import type { RoomSummary, TopicId } from '@retro/types'
import { API_BASE } from '@/lib/identity'

/**
 * API 클라이언트.
 *
 * 응답은 전부 신뢰할 수 없는 입력이다. 타입 단언으로 받지 않고 좁혀서 쓴다.
 */

export interface GameInfo {
  readonly id: string
  readonly name: string
  readonly minPlayers: number
  readonly roundMs: number
  readonly hasPresenter: boolean
  readonly tagline: string
  readonly icon: string
}

export interface CreateRoomInput {
  readonly title: string
  readonly gameId: string
  readonly mode: 'casual' | 'team' | 'solo'
  readonly rounds: number
  readonly isPublic: boolean
  /** 빈 문자열이면 잠그지 않는다. **URL 에 절대 싣지 않는다** */
  readonly password: string
  /** 고른 주제. 비어 있으면 전체 */
  readonly topics: readonly TopicId[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null)
  return isRecord(body) ? body : {}
}

export async function fetchGames(): Promise<readonly GameInfo[]> {
  const response = await fetch(`${API_BASE}/api/games`)
  const body = await readJson(response)
  const games = body['games']
  return Array.isArray(games) ? (games as GameInfo[]) : []
}

export async function fetchRooms(): Promise<readonly RoomSummary[]> {
  const response = await fetch(`${API_BASE}/api/rooms`, { cache: 'no-store' })
  const body = await readJson(response)
  const rooms = body['rooms']
  return Array.isArray(rooms) ? (rooms as RoomSummary[]) : []
}

export async function createRoom(input: CreateRoomInput): Promise<string> {
  const response = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readJson(response)
  const code = body['code']
  if (!response.ok || typeof code !== 'string') {
    throw new Error(typeof body['error'] === 'string' ? body['error'] : '방을 만들지 못했습니다')
  }
  return code
}

/** 가장 사람 많고 자리가 남은 공개 방. 없으면 null — 03 문서 §4.3 */
export async function quickJoinTarget(): Promise<string | null> {
  const response = await fetch(`${API_BASE}/api/rooms/quick`, { method: 'POST' })
  const body = await readJson(response)
  return typeof body['code'] === 'string' ? body['code'] : null
}

export interface RoomState {
  readonly code: string
  readonly title: string
  readonly players: number
  readonly capacity: number
  readonly locked: boolean
  readonly gameId: string
}

export async function fetchRoomState(code: string): Promise<RoomState | null> {
  const response = await fetch(`${API_BASE}/api/rooms/${code}/state`, { cache: 'no-store' })
  if (!response.ok) return null
  const body = await readJson(response)
  if (typeof body['code'] !== 'string') return null
  return body as unknown as RoomState
}

/**
 * 비밀번호를 확인하고 1회용 티켓을 받는다.
 *
 * WebSocket 은 커스텀 헤더를 못 붙이므로, 비밀번호를 쿼리스트링에 실으면
 * 브라우저 히스토리·리퍼러·서버 로그에 그대로 남는다. 그래서 POST 로 교환한다.
 */
export type ReportReason = 'wrong-fact' | 'wrong-answer' | 'bad-hint' | 'offensive' | 'etc'

export interface ReportInput {
  readonly gameId: string
  readonly reason: ReportReason
  /** 어떤 문항이었는지. 정답은 담지 않는다 */
  readonly subject: string
  readonly detail: string
  readonly roomCode: string
}

/**
 * 문항 신고. 웹훅 주소는 서버에만 있고 클라이언트는 우리 API 만 부른다 —
 * 웹훅을 번들에 넣으면 누구나 그 주소로 아무 메시지나 쏠 수 있다.
 */
export async function sendReport(input: ReportInput): Promise<void> {
  const response = await fetch(`${API_BASE}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await readJson(response)
    throw new Error(typeof body['error'] === 'string' ? body['error'] : '신고를 보내지 못했습니다')
  }
}

export async function requestTicket(code: string, password: string): Promise<string | null> {
  const response = await fetch(`${API_BASE}/api/rooms/${code}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await readJson(response)
  if (!response.ok) {
    throw new Error(typeof body['error'] === 'string' ? body['error'] : '비밀번호가 다릅니다')
  }
  return typeof body['ticket'] === 'string' ? body['ticket'] : null
}
