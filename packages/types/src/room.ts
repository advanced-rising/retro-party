import type { GameId, PlayerId, RoomCode, RoomId, Seed, TeamId } from './ids.ts'

/** 방 정원. 8명이 기본이자 4:4 팀전의 완성형 — 01 문서 §2.1 */
export const ROOM_CAPACITY = 8 as const

/** 이 인원이 모이면 시작할 수 있다. 채팅 게임은 둘이면 성립한다 — 03 문서 §2 */
export const MIN_PLAYERS_TO_START = 2

/**
 * solo — 혼자 모드. 본진이 아니라 대기실이다 (03 문서 §7).
 * 사람이 없는 시간에 온 사람을 그냥 보내지 않는 것이 목적이고,
 * 규칙을 여기서 배우고 방으로 넘어간다.
 */
export type RoomMode = 'casual' | 'team' | 'rank' | 'solo'

export function minPlayersFor(mode: RoomMode): number {
  return mode === 'solo' ? 1 : MIN_PLAYERS_TO_START
}

/** 팀 편성. 인원이 모자라면 축소된다 — 01 문서 §6.5.1 */
export type TeamSize = 2 | 3 | 4

export type RoomPhase =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'countdown'; readonly startsAtMs: number }
  | {
      readonly kind: 'playing'
      readonly roundNo: number
      readonly endsAtMs: number
      /** 이 라운드의 총 길이. 타이머 바가 게임별 상수를 알 필요가 없게 한다 */
      readonly roundMs: number
    }
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

/** 방 제목. 목록에 그대로 노출되므로 길이를 제한하고 정규화한다 */
export const MAX_ROOM_TITLE = 20

/** rounds 가 이 값이면 무제한. 사람이 남아 있는 한 계속 돈다 */
export const UNLIMITED_ROUNDS = 0

export interface RoomSettings {
  readonly gameId: GameId
  readonly mode: RoomMode
  /** 0 이면 무제한 — UNLIMITED_ROUNDS */
  readonly rounds: number
  readonly teamSize: TeamSize | null // mode === 'team' 일 때만
  /** 방 목록에 띄울지. 끄면 코드로만 들어온다 */
  readonly isPublic: boolean
  readonly title: string
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
  /**
   * 비밀번호가 걸려 있는가. **비밀번호 자체는 여기 없다.**
   * 방 상태는 전원에게 브로드캐스트되므로, 원문도 해시도 절대 들어오면 안 된다.
   * 실제 검증은 RoomDO 가 storage 에 둔 해시로만 한다.
   */
  readonly locked: boolean
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

export function isUnlimited(settings: RoomSettings): boolean {
  return settings.rounds <= UNLIMITED_ROUNDS
}
