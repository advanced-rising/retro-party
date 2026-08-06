import { asGameId, type GameId } from '@retro/types'
import type { RoomGame } from '@retro/room-kit'
import { chosungGame } from '@retro/game-chosung'

/**
 * 게임 레지스트리 — 09 문서 §6
 *
 * 새 게임을 붙일 때 손대는 곳은 여기 한 줄이다.
 * 방·채팅·타이머·점수·재접속은 전부 자동으로 딸려온다.
 */

/** 방 엔진은 문제 타입을 몰라도 된다. 타입을 아는 것은 게임 모듈뿐이다 */
export type AnyGame = RoomGame<never, unknown>

const GAMES: readonly RoomGame<never, never>[] = [chosungGame as unknown as RoomGame<never, never>]

export const DEFAULT_GAME_ID: GameId = chosungGame.id

export function resolveGame(gameId: GameId): AnyGame {
  const found = GAMES.find((g) => g.id === gameId)
  return (found ?? GAMES[0]) as AnyGame
}

export function listGames(): readonly { readonly id: GameId; readonly name: string }[] {
  return GAMES.map((g) => ({ id: g.id, name: g.meta.name }))
}

export function isKnownGame(value: string): value is string & GameId {
  return GAMES.some((g) => g.id === asGameId(value))
}
