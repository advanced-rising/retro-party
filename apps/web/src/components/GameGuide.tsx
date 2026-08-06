'use client'

import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { gameIcon } from '@/lib/game-icon'
import { STAGGER_STEP, TWEEN_QUICK, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 규칙 안내 — 03 문서 §4.4
 *
 * 처음 들어온 사람이 규칙을 모르면 그 라운드를 통째로 버린다. 그리고 그건
 * 「사람 있는 방에 들어갔는데 재미없었다」로 남아, 이 제품에서 가장 중요한
 * 지표(사람 있는 방을 본 비율)를 그대로 갉아먹는다.
 *
 * 그래서 대기실에서는 펼쳐 두고, 진행 중에는 접어서 물음표만 남긴다 —
 * 규칙은 항상 손이 닿는 곳에 있어야 하지만 화면을 먹으면 안 된다.
 */
export function GameGuide({
  name,
  icon,
  howTo,
  defaultOpen,
}: {
  name: string
  icon: string
  howTo: readonly string[]
  defaultOpen: boolean
}) {
  const motionOk = useMotionOk()
  const [open, setOpen] = useState(defaultOpen)
  const Icon = gameIcon(icon)

  if (howTo.length === 0) return null

  return (
    <section
      className="rounded-xl border"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <Icon size={16} className="shrink-0" color="var(--lime)" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
          {name}
          {!open && (
            <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-dim)' }}>
              어떻게 하나요?
            </span>
          )}
        </span>

        {open ? (
          <ChevronDown size={14} color="var(--text-dim)" aria-hidden />
        ) : (
          <HelpCircle size={14} color="var(--text-dim)" aria-hidden />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.ol
            className="space-y-1.5 overflow-hidden px-3 pb-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitionFor(motionOk, TWEEN_QUICK)}
          >
            {howTo.map((line, i) => (
              <m.li
                key={line}
                className="flex gap-2 text-sm"
                style={{ color: 'var(--text)' }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * STAGGER_STEP }}
              >
                <span
                  className="tnum shrink-0 font-semibold"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {i + 1}
                </span>
                {line}
              </m.li>
            ))}
          </m.ol>
        )}
      </AnimatePresence>
    </section>
  )
}
