import type { PlayerId, TeamId } from './ids.ts'
import type { Participant, RoomPhase, RoomSettings } from './room.ts'

/**
 * WebSocket 프로토콜.
 *
 * 클라이언트에서 오는 것은 전부 신뢰할 수 없는 입력이다.
 * 타입 단언(`as`)으로 받지 말고 반드시 `parseClientMessage` 를 통과시킨다.
 */

/** 팀전에서 정답 판정은 팀 채널에서만 한다 — 01 문서 §6.5.2 */
export type ChatChannel = 'team' | 'all'

export const EMOTES = ['잘한다', '헐', 'ㅋㅋㅋ', '아깝다', '음…', 'ㅎㅇ'] as const
export type Emote = (typeof EMOTES)[number]

// ── 클라이언트 → 서버 ────────────────────────────────

export type ClientMessage =
  | { readonly type: 'chat'; readonly text: string; readonly channel: ChatChannel }
  | { readonly type: 'emote'; readonly emote: Emote }
  | { readonly type: 'start' }
  | { readonly type: 'settings'; readonly patch: Partial<RoomSettings> }
  | { readonly type: 'kick'; readonly target: PlayerId }
  | { readonly type: 'again' }
  | { readonly type: 'ping' }

// ── 서버 → 클라이언트 ────────────────────────────────

export interface ChatLine {
  readonly from: PlayerId
  readonly text: string
  readonly channel: ChatChannel
  /** 정답이면 강조 표시가 붙는다. 채팅 자체는 저장하지 않는다 — 08 문서 */
  readonly correct: { readonly points: number; readonly rank: number } | null
}

export type ServerMessage =
  | {
      readonly type: 'snapshot'
      readonly phase: RoomPhase
      readonly settings: RoomSettings
      readonly participants: readonly Participant[]
      readonly scores: readonly (readonly [PlayerId, number])[]
      readonly hostId: PlayerId
      readonly you: PlayerId
      readonly yourTeam: TeamId | null
    }
  | { readonly type: 'chat'; readonly line: ChatLine }
  | { readonly type: 'joined'; readonly participant: Participant }
  | { readonly type: 'left'; readonly playerId: PlayerId }
  | { readonly type: 'phase'; readonly phase: RoomPhase }
  /** 게임별 문제 뷰. 참가자마다 다르다 — viewFor 가 정답을 걸러낸 결과 */
  | { readonly type: 'board'; readonly view: unknown }
  | { readonly type: 'score'; readonly scores: readonly (readonly [PlayerId, number])[] }
  | { readonly type: 'error'; readonly code: ServerErrorCode; readonly message: string }

export type ServerErrorCode =
  | 'room_full'
  | 'not_host'
  | 'rate_limited'
  | 'blocked_word'
  | 'invalid_message'
  | 'game_in_progress'
  | 'not_enough_players'

// ── 파서 ─────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isChannel = (v: unknown): v is ChatChannel => v === 'team' || v === 'all'

const isEmote = (v: unknown): v is Emote =>
  typeof v === 'string' && (EMOTES as readonly string[]).includes(v)

/** 채팅 한 줄 최대 길이. 초과분은 서버에서 자른다 */
export const MAX_CHAT_LENGTH = 120

/**
 * 신뢰할 수 없는 입력을 ClientMessage 로 좁힌다.
 * 실패하면 null — 호출부는 반드시 null 을 처리해야 한다.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw)) return null

  switch (raw['type']) {
    case 'chat': {
      const text = raw['text']
      if (typeof text !== 'string') return null
      const trimmed = text.trim()
      if (trimmed.length === 0 || trimmed.length > MAX_CHAT_LENGTH) return null
      if (!isChannel(raw['channel'])) return null
      return { type: 'chat', text: trimmed, channel: raw['channel'] }
    }
    case 'emote': {
      if (!isEmote(raw['emote'])) return null
      return { type: 'emote', emote: raw['emote'] }
    }
    case 'kick': {
      const target = raw['target']
      if (typeof target !== 'string' || target.length === 0) return null
      return { type: 'kick', target: target as PlayerId }
    }
    case 'settings': {
      const patch = raw['patch']
      if (!isRecord(patch)) return null
      return { type: 'settings', patch: patch as Partial<RoomSettings> }
    }
    case 'start':
      return { type: 'start' }
    case 'again':
      return { type: 'again' }
    case 'ping':
      return { type: 'ping' }
    default:
      return null
  }
}
