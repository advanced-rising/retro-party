import { asGameId, type GameId } from '@retro/types'
import type { RoomGame } from '@retro/room-kit'
import { chosungGame } from '@retro/game-chosung'
import { geuhaeGame } from '@retro/game-geuhae'
import { assocGame } from '@retro/game-assoc'
import { mulgaGame } from '@retro/game-mulga'
import { sketchGame } from '@retro/game-sketch'
import { timelineGame } from '@retro/game-timeline'
import { oxquizGame } from '@retro/game-oxquiz'
import { kkungttaGame } from '@retro/game-kkungtta'
import { baseballGame } from '@retro/game-baseball'
import { relayGame } from '@retro/game-relay'

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
  sketchGame as unknown as RoomGame<never, never>,
  timelineGame as unknown as RoomGame<never, never>,
  oxquizGame as unknown as RoomGame<never, never>,
  kkungttaGame as unknown as RoomGame<never, never>,
  baseballGame as unknown as RoomGame<never, never>,
  relayGame as unknown as RoomGame<never, never>,
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
  /**
   * 어떻게 하는 게임인가. 대기실과 첫 라운드에 보여준다.
   *
   * 처음 들어온 사람이 규칙을 모르면 그 라운드를 통째로 버린다. 그리고
   * 그건 「사람 있는 방에 들어갔는데 재미없었다」로 남아 03 문서의
   * 콜드스타트 지표를 그대로 갉아먹는다.
   */
  readonly howTo: readonly string[]
}

const TAGLINES: Readonly<Record<string, string>> = {
  chosung: '초성만 보고 단어를 외친다. 20초, 가장 빠른 리듬',
  geuhae: '힌트가 하나씩 열린다. 먼저 연도를 맞히면 이긴다',
  assoc: '한 명이 설명하고 나머지가 맞힌다. 매번 다른 판',
  mulga: '그때 그 가격을 맞힌다. 더 비싼지 싼지 알려준다',
  sketch: '한 명이 그리고 나머지가 맞힌다. 못 그릴수록 재밌다',
  timeline: '사건 다섯 개를 시간순으로 늘어놓는다. 거의 맞춰도 점수를 준다',
  oxquiz: '10초. 생각할 틈을 주지 않는다. 가장 빠른 리듬',
  kkungtta: '세 글자로 끝말을 잇는다. 오래 이을수록 좋다',
  baseball: '스트라이크와 볼로 숫자를 좁혀 간다. 아는 게 없어도 된다',
  relay: '여럿이 이어서 한 그림을 그린다. 무너지는 게 재밌다',
}

const ICONS: Readonly<Record<string, string>> = {
  chosung: 'spell-check',
  geuhae: 'calendar-clock',
  assoc: 'messages-square',
  mulga: 'coins',
  sketch: 'pencil',
  timeline: 'list-ordered',
  oxquiz: 'circle-slash',
  kkungtta: 'link',
  baseball: 'target',
  relay: 'users-round',
}

export function resolveGame(gameId: GameId): AnyGame {
  const found = GAMES.find((g) => g.id === gameId)
  return (found ?? GAMES[0]) as AnyGame
}

const HOW_TO: Readonly<Record<string, readonly string[]>> = {
  chosung: [
    '초성과 카테고리를 보고 단어를 채팅에 칩니다',
    '8초에 설명, 14초에 첫 글자 모음이 열립니다',
    '먼저 칠수록 점수가 높습니다',
  ],
  geuhae: [
    '힌트를 보고 연도를 채팅에 칩니다',
    '8초마다 힌트가 하나씩 열립니다 — 적게 보고 맞힐수록 고득점',
    '1997 도 97 도 됩니다. 한 해 차이는 부분 점수',
  ],
  assoc: [
    '출제자가 채팅으로 설명하고 나머지가 단어를 맞힙니다',
    '출제자는 정답과 비슷한 말을 쓸 수 없습니다',
    '출제자도 맞힌 사람 수만큼 점수를 받습니다',
  ],
  mulga: [
    '그 시절 가격을 숫자로 칩니다',
    '틀리면 더 비싼지 싼지 알려줍니다 — 좁혀 가세요',
    '오차 5% 안이면 정답, 20% 안이면 부분 점수',
  ],
  sketch: [
    '한 명이 그리고 나머지가 채팅으로 맞힙니다',
    '그리는 사람은 글씨나 정답을 쓸 수 없습니다',
    '그리는 사람도 맞힌 사람 수만큼 점수를 받습니다',
  ],
  relay: [
    '여럿이 12초씩 돌아가며 한 그림을 그립니다',
    '앞사람이 뭘 그리려던 건지는 알 수 없습니다',
    '그린 사람들은 보너스를 나눠 갖습니다',
  ],
  timeline: [
    '사건 다섯 개를 오래된 순서로 늘어놓습니다',
    '손잡이를 끌거나 화살표로 옮기고 제출하세요',
    '거의 맞춰도 점수를 받습니다',
  ],
  oxquiz: [
    '10초 안에 O 또는 X 를 고릅니다',
    '한 번 틀리면 그 라운드는 끝입니다',
    '채팅에 O · X 를 쳐도 됩니다',
  ],
  kkungtta: [
    '앞 단어의 끝 글자로 시작하는 세 글자 단어를 칩니다',
    '이미 나온 단어는 다시 쓸 수 없습니다',
    '시간이 끝날 때까지 계속 이어 갑니다',
  ],
  baseball: [
    '서로 다른 숫자 세 개를 채팅에 칩니다',
    '자리까지 맞으면 스트라이크, 숫자만 있으면 볼',
    '판정을 조합해 좁혀 가세요. 아는 게 없어도 됩니다',
  ],
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
    howTo: HOW_TO[g.id] ?? [],
  }))
}

export function isKnownGame(value: string): boolean {
  return GAMES.some((g) => g.id === asGameId(value))
}
