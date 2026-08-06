'use client'

import { useEffect } from 'react'

/**
 * 키보드 단축키 — PC 전용.
 *
 * ## 왜 문자 키를 못 쓰는가
 *
 * 이 게임은 **채팅 입력창이 항상 포커스를 잡고 있다.** 정답 입력이 곧
 * 채팅이라 그래야 한다. 그래서 `s` 나 `h` 같은 문자 키를 단축키로 잡으면
 * 그 글자를 못 치게 된다. 한글 IME 에서는 더 심각해서, 조합 중인 글자가
 * 통째로 날아가거나 예상 못 한 자모가 들어간다.
 *
 * 그래서 여기서는 **조합 키(Alt)와 방향키만** 쓴다.
 *   · Alt 조합은 IME 가 문자로 해석하지 않는다
 *   · 방향키는 입력창이 비어 있을 때 아무 일도 안 한다
 *
 * IME 조합 중(`isComposing`)에는 무조건 무시한다 — 조합 중 키를 가로채면
 * 글자가 깨진다.
 */

export interface Shortcut {
  readonly key: string
  /** Alt 를 함께 눌러야 하는가 */
  readonly alt?: boolean
  readonly run: () => void
  /** 조건이 false 면 무시한다 */
  readonly when?: boolean
  /** 화면에 보여줄 설명. 없으면 안내에 안 나온다 */
  readonly label?: string
}

export function useShortcuts(shortcuts: readonly Shortcut[]): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // ★ 한글 조합 중에는 절대 가로채지 않는다
      if (event.isComposing || event.keyCode === 229) return

      for (const shortcut of shortcuts) {
        if (shortcut.when === false) continue
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue
        if ((shortcut.alt ?? false) !== event.altKey) continue

        event.preventDefault()
        shortcut.run()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])
}

/** 안내에 띄울 표기 — macOS 는 Alt 를 ⌥ 로 읽는다 */
export function keyLabel(shortcut: Shortcut): string {
  const mac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  const alt = shortcut.alt === true ? (mac ? '⌥' : 'Alt+') : ''
  const key = shortcut.key === 'Escape' ? 'Esc' : shortcut.key.replace(/^Arrow/, '')
  return `${alt}${key}`
}
