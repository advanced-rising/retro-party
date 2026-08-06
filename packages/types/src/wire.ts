import type { PlayerId, TeamId } from './ids.ts'
import type { Participant, RoomPhase, RoomSettings } from './room.ts'
import {
  isSketchColor,
  isSketchWidth,
  parseStrokePoints,
  type SketchColor,
  type SketchStroke,
  type SketchWidth,
} from './sketch.ts'

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
  /** 이 라운드를 빨리 넘기자는 표. 전원이 동의하면 남은 시간이 줄어든다 */
  | { readonly type: 'skip' }
  /** 다음 힌트를 먼저 보자는 표. 과반이면 바로 열린다 */
  | { readonly type: 'hint' }
  /** 스케치 — 한 획. 출제자만 보낼 수 있고 서버가 확인한다 */
  | {
      readonly type: 'stroke'
      readonly color: SketchColor
      readonly width: SketchWidth
      readonly points: readonly { readonly x: number; readonly y: number }[]
    }
  /** 스케치 — 지우기 · 되돌리기 */
  | { readonly type: 'canvas'; readonly action: 'clear' | 'undo' }

  | { readonly type: 'ping' }

// ── 서버 → 클라이언트 ────────────────────────────────

export interface ChatLine {
  readonly from: PlayerId
  readonly text: string
  readonly channel: ChatChannel
  /** 정답이면 강조 표시가 붙는다. 채팅 자체는 저장하지 않는다 — 08 문서 */
  readonly correct: { readonly points: number; readonly rank: number } | null
  /** 판정이 남긴 한 줄. 「그때 그 가격」의 "더 비싸요" 같은 것 */
  readonly note: string | null
}

/**
 * 라운드 기록 — 판이 끝나고 되짚어 보는 용도.
 *
 * 정답은 **공개된 뒤에만** 여기 실린다. 진행 중에는 절대 나가지 않는다.
 * "아 그거였어?" 가 결과 화면에서 나와야 다음 판을 누른다 (02 문서 §1.4).
 */
export interface RoundRecord {
  readonly roundNo: number
  readonly answer: string
  /** 맞힌 순서대로. 아무도 못 맞혔으면 빈 배열 */
  readonly solvers: readonly RoundSolver[]
}

export interface RoundSolver {
  readonly playerId: PlayerId
  readonly points: number
  /** 라운드 시작부터 맞히기까지 걸린 시간 */
  readonly elapsedMs: number
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
  /** 판이 끝날 때 한 번. 지나온 라운드를 통째로 돌려준다 */
  | { readonly type: 'history'; readonly rounds: readonly RoundRecord[] }
  /** 스킵 표 현황. 모두 모이면 남은 시간이 줄어든다 */
  | {
      readonly type: 'skip'
      readonly votes: number
      readonly needed: number
      /** 나도 눌렀는가 */
      readonly you: boolean
    }
  /** 스케치 — 새로 그어진 획 하나 */
  | { readonly type: 'stroke'; readonly stroke: SketchStroke }
  /** 스케치 — 캔버스 전체 상태. 늦게 들어온 사람에게 지금까지의 그림을 준다 */
  | { readonly type: 'sketch'; readonly strokes: readonly SketchStroke[] }
  /** 힌트 표 현황. 과반이면 다음 힌트가 바로 열린다 */
  | {
      readonly type: 'hint'
      readonly votes: number
      readonly needed: number
      readonly you: boolean
      /** 더 열 힌트가 남았는가 */
      readonly available: boolean
    }
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
    case 'skip':
      return { type: 'skip' }
    case 'hint':
      return { type: 'hint' }
    case 'stroke': {
      if (!isSketchColor(raw['color']) || !isSketchWidth(raw['width'])) return null
      const points = parseStrokePoints(raw['points'])
      if (points === null) return null
      return { type: 'stroke', color: raw['color'], width: raw['width'], points }
    }
    case 'canvas': {
      const action = raw['action']
      if (action !== 'clear' && action !== 'undo') return null
      return { type: 'canvas', action }
    }
    case 'ping':
      return { type: 'ping' }
    default:
      return null
  }
}
