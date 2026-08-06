import { asGameId, type GameId } from '@retro/types'
import type { RoomGame } from '@retro/room-kit'
import { chosungGame } from '@retro/game-chosung'
import { geuhaeGame } from '@retro/game-geuhae'
import { assocGame } from '@retro/game-assoc'
import { mulgaGame } from '@retro/game-mulga'

/**
 * 게임 레지스트리 — 09 문서 §6
 *
 * 새 게임을 붙일 때 손대는 곳은 이 배열 한 줄이다.
 * 방·채팅·타이머·점수·재접속·팀전은 전부 자동으로 딸려온다.
 */

/** 방 엔진은 문제 타입을 몰라도 된다. 타입을 아는 것은 게임 모듈뿐이다 */
export type AnyGame = RoomGame<never, unknown>

const GAMES: readonly RoomGame<never, never>[] = [
  chosungGame as unknown as RoomGame<never, never>,
  geuhaeGame as unknown as RoomGame<never, never>,
  assocGame as unknown as RoomGame<never, never>,
  mulgaGame as unknown as RoomGame<never, never>,
]

export const DEFAULT_GAME_ID: GameId = chosungGame.id

export interface GameInfo {
  readonly id: GameId
  readonly name: string
  readonly minPlayers: number
  readonly roundMs: number
  readonly hasPresenter: boolean
  /** 한 줄 소개. 방 만들기 화면에서 고를 때 보인다 */
  readonly tagline: string
  /** 아이콘 이름. 웹이 Lucide 아이콘으로 매핑한다 — 이모지는 쓰지 않는다 (06 문서 §4.2) */
  readonly icon: string
}

const TAGLINES: Readonly<Record<string, string>> = {
  chosung: '초성만 보고 단어를 외친다. 20초, 가장 빠른 리듬',
  geuhae: '힌트가 하나씩 열린다. 먼저 연도를 맞히면 이긴다',
  assoc: '한 명이 설명하고 나머지가 맞힌다. 매번 다른 판',
  mulga: '그때 그 가격을 맞힌다. 더 비싼지 싼지 알려준다',
}

const ICONS: Readonly<Record<string, string>> = {
  chosung: 'spell-check',
  geuhae: 'calendar-clock',
  assoc: 'messages-square',
  mulga: 'coins',
}

export function resolveGame(gameId: GameId): AnyGame {
  const found = GAMES.find((g) => g.id === gameId)
  return (found ?? GAMES[0]) as AnyGame
}

export function listGames(): readonly GameInfo[] {
  return GAMES.map((g) => ({
    id: g.id,
    name: g.meta.name,
    minPlayers: g.meta.minPlayers,
    roundMs: g.meta.roundMs,
    hasPresenter: g.meta.hasPresenter,
    tagline: TAGLINES[g.id] ?? '',
    icon: ICONS[g.id] ?? 'gamepad-2',
  }))
}

export function isKnownGame(value: string): boolean {
  return GAMES.some((g) => g.id === asGameId(value))
}
