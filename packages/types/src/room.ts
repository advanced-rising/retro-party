import type { GameId, PlayerId, RoomCode, RoomId, Seed, TeamId } from './ids.ts'

/** 방 정원. 8명이 기본이자 4:4 팀전의 완성형 — 01 문서 §2.1 */
export const ROOM_CAPACITY = 8 as const

/** 이 인원이 모이면 시작할 수 있다. 채팅 게임은 둘이면 성립한다 — 03 문서 §2 */
export const MIN_PLAYERS_TO_START = 2

export type RoomMode = 'casual' | 'team' | 'rank'

/** 팀 편성. 인원이 모자라면 축소된다 — 01 문서 §6.5.1 */
export type TeamSize = 2 | 3 | 4

export type RoomPhase =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'countdown'; readonly startsAtMs: number }
  | { readonly kind: 'playing'; readonly roundNo: number; readonly endsAtMs: number }
  | { readonly kind: 'reveal'; readonly roundNo: number; readonly endsAtMs: number }
  | { readonly kind: 'result' }

/**
 * 참가자는 전부 실제 사람이다. 봇·AI·더미 참가자는 존재하지 않는다.
 *
 * 빈 방 문제는 가짜 사람으로 덮지 않고 사람을 한곳에 모아서 푼다 — 03 문서.
 */
export interface Participant {
  readonly playerId: PlayerId
  readonly nickname: string
  readonly avatarIcon: string
  readonly level: number
  readonly titleName: string | null
  readonly team: TeamId | null
  readonly connected: boolean
  /** 팀전 인원이 홀수라 이번 판을 쉬는 사람 — 01 문서 §6.5.1 */
  readonly benched: boolean
}

export interface RoomSettings {
  readonly gameId: GameId
  readonly mode: RoomMode
  readonly rounds: number
  readonly teamSize: TeamSize | null // mode === 'team' 일 때만
  readonly isPublic: boolean
}

export interface RoomState {
  readonly roomId: RoomId
  readonly code: RoomCode
  readonly seed: Seed
  readonly hostId: PlayerId
  readonly settings: RoomSettings
  readonly phase: RoomPhase
  readonly participants: readonly Participant[]
  readonly scores: ReadonlyMap<PlayerId, number>
}

export function isTeamMode(state: RoomState): boolean {
  return state.settings.mode === 'team'
}

/** 지금 실제로 게임에 참여 중인 사람 — 접속이 끊겼거나 쉬는 사람은 뺀다 */
export function activePlayers(state: RoomState): readonly Participant[] {
  return state.participants.filter((p) => p.connected && !p.benched)
}

export function canStart(state: RoomState): boolean {
  return activePlayers(state).length >= MIN_PLAYERS_TO_START
}
