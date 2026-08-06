'use client'

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { play, setSoundEnabled, soundEnabled } from '@/lib/sound'

/** 소리 켜고 끄기. 끌 수 없는 소리는 넣지 않는다 */
export function SoundToggle() {
  const [on, setOn] = useState(true)

  useEffect(() => setOn(soundEnabled()), [])

  const toggle = (): void => {
    const next = !on
    setOn(next)
    setSoundEnabled(next)
    // 켠 순간 어떤 소리인지 바로 들려준다
    if (next) play('join')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
      aria-label={on ? '소리 끄기' : '소리 켜기'}
      aria-pressed={on}
      title={on ? '소리 켜짐' : '소리 꺼짐'}
    >
      {on ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
    </button>
  )
}
