/**
 * 컬러 토큰 대비 검증 — 06 문서 §2.3
 *
 *   node --experimental-strip-types tools/contrast.ts
 *
 * 본문 4.5:1 (WCAG AA) · 비텍스트 3:1 (WCAG 1.4.11)
 * 배경은 각 테마에서 가장 불리한 표면(bg-elevated)으로 계산한다.
 * 실패가 하나라도 있으면 exit 1 — CI 에서 머지를 막는다.
 */

type Hex = `#${string}`

const TOKEN_NAMES = [
  'bg-base',
  'bg-surface',
  'bg-elevated',
  'border',
  'border-hi',
  'text-hi',
  'text',
  'text-lo',
  'text-dim',
  'lime',
  'on-lime',
  'lime-wash',
  'blue',
  'red',
  'amber',
  'gold',
  'purple',
  'avatar-bg',
  'avatar-fg',
] as const

type TokenName = (typeof TOKEN_NAMES)[number]
type Palette = Readonly<Record<TokenName, Hex>>

const LIGHT: Palette = {
  'bg-base': '#F7F8FA',
  'bg-surface': '#FFFFFF',
  'bg-elevated': '#EFF1F5',
  border: '#E3E7EC',
  'border-hi': '#CFD5DE',
  'text-hi': '#12151A',
  text: '#3A4049',
  'text-lo': '#586070',
  'text-dim': '#646C7A',
  lime: '#1B7A10',
  'on-lime': '#FFFFFF',
  'lime-wash': '#E8FADF',
  blue: '#1D4ED8',
  red: '#BE1C1C',
  amber: '#9A4C07',
  gold: '#7A5A0F',
  purple: '#6D28D9',
  'avatar-bg': '#5F6874',
  'avatar-fg': '#FFFFFF',
}

const DARK: Palette = {
  'bg-base': '#0D0F14',
  'bg-surface': '#161A22',
  'bg-elevated': '#1E232D',
  border: '#252A34',
  'border-hi': '#3D4757',
  'text-hi': '#F2F4F8',
  text: '#C6CCD6',
  'text-lo': '#8E96A4',
  'text-dim': '#828B99',
  lime: '#7CFF6B',
  'on-lime': '#07240A',
  'lime-wash': '#1D3320',
  blue: '#7FB4FF',
  red: '#FF7A7A',
  amber: '#FFC470',
  gold: '#FFDD7A',
  purple: '#C4A3FF',
  'avatar-bg': '#7C8798',
  'avatar-fg': '#0B0C0F',
}

interface Check {
  readonly label: string
  readonly fg: TokenName
  readonly bg: TokenName
  /** WCAG 최소 대비. 본문 4.5, 비텍스트 3.0 */
  readonly min: 3 | 4.5
}

const CHECKS: readonly Check[] = [
  { label: '제목', fg: 'text-hi', bg: 'bg-elevated', min: 4.5 },
  { label: '본문 · 채팅', fg: 'text', bg: 'bg-elevated', min: 4.5 },
  { label: '닉네임 · 메타', fg: 'text-lo', bg: 'bg-elevated', min: 4.5 },
  { label: '캡션 (최하 단계)', fg: 'text-dim', bg: 'bg-elevated', min: 4.5 },
  { label: '정답 텍스트', fg: 'lime', bg: 'bg-elevated', min: 4.5 },
  { label: '정답 · 하이라이트 위', fg: 'lime', bg: 'lime-wash', min: 4.5 },
  { label: '버튼 글자', fg: 'on-lime', bg: 'lime', min: 4.5 },
  { label: '타이머 바 · 트랙 대비', fg: 'lime', bg: 'border', min: 3 },
  { label: '시간부족 바', fg: 'amber', bg: 'border', min: 3 },
  { label: '위험 바', fg: 'red', bg: 'border', min: 3 },
  { label: '청팀 텍스트', fg: 'blue', bg: 'bg-elevated', min: 4.5 },
  { label: '홍팀 텍스트', fg: 'red', bg: 'bg-elevated', min: 4.5 },
  { label: '시간부족 텍스트', fg: 'amber', bg: 'bg-elevated', min: 4.5 },
  { label: '1등 금색', fg: 'gold', bg: 'bg-elevated', min: 4.5 },
  { label: '출제자 보라', fg: 'purple', bg: 'bg-elevated', min: 4.5 },
  { label: '아바타 이니셜', fg: 'avatar-fg', bg: 'avatar-bg', min: 4.5 },
]

const toLinear = (channel: number): number =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

function luminance(hex: Hex): number {
  const body = hex.slice(1)
  if (body.length !== 6) throw new TypeError(`6자리 hex 가 아닙니다: ${hex}`)
  const channel = (offset: number): number => Number.parseInt(body.slice(offset, offset + 2), 16) / 255
  return (
    0.2126 * toLinear(channel(0)) + 0.7152 * toLinear(channel(2)) + 0.0722 * toLinear(channel(4))
  )
}

function ratio(a: Hex, b: Hex): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

function audit(themeName: string, palette: Palette): number {
  console.log(`\n${themeName}  (최악 표면 ${palette['bg-elevated']})`)
  console.log('─'.repeat(62))

  let failed = 0
  for (const check of CHECKS) {
    const fg = palette[check.fg]
    const bg = palette[check.bg]
    const value = ratio(fg, bg)
    const ok = value >= check.min
    if (!ok) failed += 1
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'}  ${value.toFixed(2).padStart(5)} (>=${check.min})  ` +
        `${check.label.padEnd(22)} ${fg} / ${bg}`,
    )
  }
  return failed
}

const failures = audit('LIGHT', LIGHT) + audit('DARK', DARK)

console.log('')
if (failures > 0) {
  console.error(`실패 ${failures}건 — 06 문서 §2.2 토큰을 고치세요.`)
  process.exit(1)
}
console.log(`전 항목 통과 (${CHECKS.length * 2}건).`)
