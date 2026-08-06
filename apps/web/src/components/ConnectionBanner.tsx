'use client'

import { AnimatePresence, m } from 'motion/react'
import { Loader2, WifiOff } from 'lucide-react'
import { transitionFor, TWEEN_QUICK, useMotionOk } from '@/lib/motion'

/**
 * 연결이 끊겼을 때.
 *
 * 아이콘 하나만 바뀌면 「내가 뭘 잘못했나」로 읽힌다. 실제로는 서버가
 * 알아서 다시 붙이는 중이고 **점수도 자리도 그대로 남아 있다** —
 * 그 사실을 말해주지 않으면 사람들이 새로고침하거나 나가버린다.
 */
export function ConnectionBanner({
  connected,
  retries,
}: {
  connected: boolean
  retries: number
}) {
  const motionOk = useMotionOk()
  // 첫 접속 중에는 띄우지 않는다. 끊긴 적이 있어야 「다시」 붙는 것이다
  const show = !connected && retries > 0

  return (
    <AnimatePresence>
      {show && (
        <m.p
          className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--amber)' }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={transitionFor(motionOk, TWEEN_QUICK)}
          role="status"
        >
          <WifiOff size={14} className="shrink-0" color="var(--amber)" aria-hidden />
          <span className="min-w-0 flex-1" style={{ color: 'var(--text-hi)' }}>
            연결이 끊겼습니다
            <span className="ml-1.5 text-xs" style={{ color: 'var(--text-lo)' }}>
              점수와 자리는 그대로 있어요
            </span>
          </span>
          <m.span
            className="shrink-0"
            animate={motionOk ? { rotate: 360 } : { rotate: 0 }}
            transition={
              motionOk
                ? { duration: 1, repeat: Infinity, ease: 'linear' }
                : { duration: 0 }
            }
          >
            <Loader2 size={14} color="var(--text-lo)" aria-hidden />
          </m.span>
        </m.p>
      )}
    </AnimatePresence>
  )
}
