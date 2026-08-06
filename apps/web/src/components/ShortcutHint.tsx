'use client'

import { keyLabel, type Shortcut } from '@/lib/shortcuts'

/**
 * 단축키 안내 — 넓은 화면에서만 보인다.
 *
 * 폰에는 키보드 단축키가 없으므로 자리만 차지한다. `hidden lg:flex` 로
 * 아예 렌더에서 뺀다 — 숨기기만 하면 스크린리더가 읽는다.
 */
export function ShortcutHint({ shortcuts }: { shortcuts: readonly Shortcut[] }) {
  const shown = shortcuts.filter((s) => s.label !== undefined && s.when !== false)
  if (shown.length === 0) return null

  return (
    <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-xs lg:flex">
      {shown.map((shortcut) => (
        <span key={shortcut.key + String(shortcut.alt)} className="flex items-center gap-1">
          <kbd
            className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          >
            {keyLabel(shortcut)}
          </kbd>
          <span style={{ color: 'var(--text-dim)' }}>{shortcut.label}</span>
        </span>
      ))}
    </p>
  )
}
