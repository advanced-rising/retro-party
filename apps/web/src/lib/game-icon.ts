import {
  CalendarClock,
  Coins,
  Gamepad2,
  MessagesSquare,
  SpellCheck,
  type LucideIcon,
} from 'lucide-react'

/**
 * 게임 아이콘 — 06 문서 §4
 *
 * 이름은 서버(레지스트리)가 정하고 그림은 여기서 고른다.
 * 이모지를 쓰지 않는 이유는 색을 못 입히기 때문이다 — 아이콘은 단색이라
 * 선택된 게임에 라임을, 나머지에 회색을 줄 수 있다.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  'spell-check': SpellCheck,
  'calendar-clock': CalendarClock,
  'messages-square': MessagesSquare,
  coins: Coins,
  'gamepad-2': Gamepad2,
}

export function gameIcon(name: string): LucideIcon {
  return ICONS[name] ?? Gamepad2
}
