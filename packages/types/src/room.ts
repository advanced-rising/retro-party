import type { GameId, PlayerId, RoomCode, RoomId, Seed, TeamId } from './ids.ts'

/** 방 정원. 8명이 기본이자 4:4 팀전의 완성형 — 01 문서 §2.1 */
export const ROOM_CAPACITY = 8 as const

export type RoomMode = 'casual' | 'team' | 'rank'

/** 팀 편성. 인원이 모자라면 축소되고 AI 로 양 팀을 균등하게 채운다 — 01 문서 §6.5.1 */
export type TeamSize = 2 | 3 | 4

export type RoomPhase =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'countdown'; readonly startsAtMs: number }
  | { readonly kind: 'playing'; readonly roundNo: number; readonly endsAtMs: number }
  | { readonly kind: 'reveal'; readonly roundNo: number; readonly endsAtMs: number }
  | { readonly kind: 'result' }

/** AI 참가자는 숨기지 않는다 — 03 문서 §3.1 */
export type Participant =
  | {
      readonly kind: 'human'
      readonly playerId: PlayerId
      readonly nickname: string
      readonly avatarIcon: string
      readonly level: number
      readonly titleName: string | null
      readonly team: TeamId | null
      readonly connected: boolean
    }
  | {
      readonly kind: 'ai'
      readonly playerId: PlayerId
      readonly persona: AiPersona
      readonly team: TeamId | null
    }

export type AiPersona =
  | '96학번'
  | '밀레니엄'
  | '만렙'
  | '눈치백단'
  | '오락실죽순이'

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

export function humansIn(state: RoomState): readonly Participant[] {
  return state.participants.filter((p) => p.kind === 'human')
}

/** AI 비율 — 03 문서 §3.6 의 추적 지표. 60% 초과가 지속되면 경보 */
export function aiRatio(state: RoomState): number {
  const total = state.participants.length
  if (total === 0) return 0
  const ai = state.participants.filter((p) => p.kind === 'ai').length
  return ai / total
}
