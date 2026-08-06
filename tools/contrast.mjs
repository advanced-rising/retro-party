#!/usr/bin/env node
/**
 * 컬러 토큰 대비 검증 — 06 문서 §2.3
 *
 *   node tools/contrast.mjs
 *
 * 본문 4.5:1 (WCAG AA) · 비텍스트 3:1 (WCAG 1.4.11)
 * 배경은 각 테마에서 가장 불리한 표면(--bg-elevated)으로 계산한다.
 * 실패가 하나라도 있으면 exit 1 — CI에서 머지를 막는다.
 */

const LIGHT = {
  'bg-base': '#F7F8FA', 'bg-surface': '#FFFFFF', 'bg-elevated': '#EFF1F5',
  border: '#E3E7EC', 'border-hi': '#CFD5DE',
  'text-hi': '#12151A', text: '#3A4049', 'text-lo': '#586070', 'text-dim': '#646C7A',
  lime: '#1B7A10', 'on-lime': '#FFFFFF', 'lime-wash': '#E8FADF',
  blue: '#1D4ED8', red: '#BE1C1C', amber: '#9A4C07', gold: '#7A5A0F', purple: '#6D28D9',
  'avatar-bg': '#5F6874', 'avatar-fg': '#FFFFFF',
}

const DARK = {
  'bg-base': '#0D0F14', 'bg-surface': '#161A22', 'bg-elevated': '#1E232D',
  border: '#252A34', 'border-hi': '#3D4757',
  'text-hi': '#F2F4F8', text: '#C6CCD6', 'text-lo': '#8E96A4', 'text-dim': '#828B99',
  lime: '#7CFF6B', 'on-lime': '#07240A', 'lime-wash': '#1D3320',
  blue: '#7FB4FF', red: '#FF7A7A', amber: '#FFC470', gold: '#FFDD7A', purple: '#C4A3FF',
  'avatar-bg': '#7C8798', 'avatar-fg': '#0B0C0F',
}

/** [라벨, 전경 토큰, 배경 토큰, 최소 대비] */
const CHECKS = [
  ['제목',                  'text-hi',   'bg-elevated', 4.5],
  ['본문 · 채팅',           'text',      'bg-elevated', 4.5],
  ['닉네임 · 메타',         'text-lo',   'bg-elevated', 4.5],
  ['캡션 (최하 단계)',      'text-dim',  'bg-elevated', 4.5],
  ['정답 텍스트',           'lime',      'bg-elevated', 4.5],
  ['정답 · 하이라이트 위',  'lime',      'lime-wash',   4.5],
  ['버튼 글자',             'on-lime',   'lime',        4.5],
  ['타이머 바 · 트랙 대비', 'lime',      'border',      3.0],
  ['시간부족 바',           'amber',     'border',      3.0],
  ['위험 바',               'red',       'border',      3.0],
  ['청팀 텍스트',           'blue',      'bg-elevated', 4.5],
  ['홍팀 텍스트',           'red',       'bg-elevated', 4.5],
  ['시간부족 텍스트',       'amber',     'bg-elevated', 4.5],
  ['1등 금색',              'gold',      'bg-elevated', 4.5],
  ['AI 보라',               'purple',    'bg-elevated', 4.5],
  ['아바타 이니셜',         'avatar-fg', 'avatar-bg',   4.5],
]

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function luminance(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function audit(name, tokens) {
  console.log(`\n${name}  (최악 표면 ${tokens['bg-elevated']})`)
  console.log('─'.repeat(62))
  let failed = 0
  for (const [label, fg, bg, need] of CHECKS) {
    const v = ratio(tokens[fg], tokens[bg])
    const ok = v >= need
    if (!ok) failed++
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'}  ${v.toFixed(2).padStart(5)} (>=${need})  ` +
      `${label.padEnd(22)} ${tokens[fg]} / ${tokens[bg]}`,
    )
  }
  return failed
}

const failed = audit('LIGHT', LIGHT) + audit('DARK', DARK)

console.log('')
if (failed > 0) {
  console.error(`실패 ${failed}건 — 06 문서 §2.2 토큰을 고치세요.`)
  process.exit(1)
}
console.log(`전 항목 통과 (${CHECKS.length * 2}건).`)
