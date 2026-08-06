/**
 * 브랜디드 ID — 서로 다른 식별자가 섞이는 사고를 컴파일 타임에 막는다.
 *
 *   const r: RoomId = asRoomId('3')
 *   const p: PlayerId = r          // ✗ 컴파일 에러
 *
 * 모든 ID 는 런타임에 string 이지만 타입 레벨에서는 교환 불가다.
 */

declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

export type RoomId = Brand<string, 'RoomId'>
export type RoomCode = Brand<string, 'RoomCode'> // 6자리 초대 코드
export type PlayerId = Brand<string, 'PlayerId'>
export type UserId = Brand<string, 'UserId'>
export type MatchId = Brand<string, 'MatchId'>
export type GameId = Brand<string, 'GameId'>
export type TitleId = Brand<string, 'TitleId'>
export type Seed = Brand<string, 'Seed'>

/** 팀 번호. 0 = 청팀, 1 = 홍팀. 팀전이 아니면 null */
export type TeamId = 0 | 1

export const asRoomId = (v: string): RoomId => v as RoomId
export const asRoomCode = (v: string): RoomCode => v as RoomCode
export const asPlayerId = (v: string): PlayerId => v as PlayerId
export const asUserId = (v: string): UserId => v as UserId
export const asMatchId = (v: string): MatchId => v as MatchId
export const asGameId = (v: string): GameId => v as GameId
export const asTitleId = (v: string): TitleId => v as TitleId
export const asSeed = (v: string): Seed => v as Seed

/** 6자리 초대 코드 형식 검증. 혼동되는 글자(0/O, 1/I)는 제외한다. */
const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export function parseRoomCode(input: string): RoomCode | null {
  const upper = input.trim().toUpperCase()
  return ROOM_CODE_RE.test(upper) ? asRoomCode(upper) : null
}
