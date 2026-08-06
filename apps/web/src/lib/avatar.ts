import {
  Bot,
  Disc3,
  Save,
  Gamepad2,
  Ghost,
  Radio,
  Rocket,
  Tv,
  type LucideIcon,
} from 'lucide-react'

/**
 * 아바타 아이콘 — 06 문서 §4.3
 *
 * 이모지를 쓰지 않는다. 아이콘은 단색이라 팀 색을 입힐 수 있고,
 * 기기마다 같은 그림이 나온다.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  'cassette-tape': Radio,
  'floppy-disk': Save,
  'game-controller': Gamepad2,
  'vinyl-record': Disc3,
  'television-simple': Tv,
  boombox: Radio,
  rocket: Rocket,
  ghost: Ghost,
}

export function avatarIcon(name: string): LucideIcon {
  return ICONS[name] ?? Bot
}
