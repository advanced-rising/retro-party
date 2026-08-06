'use client'

import { Crown } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import type { Participant, PlayerId } from '@retro/types'
import { Avatar } from '@/components/Avatar'
import { ScoreNumber } from '@/components/ScoreNumber'
import { SPRING_SETTLE, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 참가자 목록 — 06 문서 §6
 *
 * 여기 보이는 사람은 전부 실제 접속자다. 자리를 채워 넣는 표시는 없다 (03 문서).
 *
 * 점수 순으로 정렬하므로 누가 맞히면 **순위가 실제로 바뀐다.** 그 순간을
 * `layout` 으로 잡아 주면(FLIP) 줄이 미끄러지며 자리를 바꾼다 — 이 게임에서
 * 가장 통쾌한 순간이 여기다. 순서만 갈아끼우면 그냥 툭 바뀌어서 아무 느낌이 없다.
 */
export function Roster({
  participants,
  scores,
  hostId,
  you,
  presenter,
}: {
  participants: readonly Participant[]
  scores: ReadonlyMap<PlayerId, number>
  hostId: PlayerId | null
  you: PlayerId | null
  presenter?: PlayerId | null
}) {
  const motionOk = useMotionOk()
  const ranked = [...participants].sort(
    (a, b) => (scores.get(b.playerId) ?? 0) - (scores.get(a.playerId) ?? 0),
  )
  const top = ranked[0] === undefined ? 0 : (scores.get(ranked[0].playerId) ?? 0)

  return (
    <ul className="space-y-1" aria-label={`참가자 ${participants.length}명`}>
      <AnimatePresence initial={false}>
        {ranked.map((p, index) => {
          const score = scores.get(p.playerId) ?? 0
          const first = top > 0 && score === top
          return (
            <m.li
              key={p.playerId}
              layout={motionOk}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: p.benched ? 0.55 : 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={transitionFor(motionOk, SPRING_SETTLE)}
              className="relative flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5"
              style={{ background: p.playerId === you ? 'var(--bg-elevated)' : 'transparent' }}
            >
              {/* 줄 자체가 layout 으로 미끄러지므로 숫자까지 움직이면 울렁거린다 */}
              <span
                className="tnum w-4 shrink-0 text-xs font-semibold"
                style={{ color: first ? 'var(--gold)' : 'var(--text-dim)' }}
              >
                {index + 1}
              </span>

              <Avatar participant={p} presenting={presenter === p.playerId} />

              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-hi)' }}>
                {p.nickname}
                {p.playerId === hostId && (
                  <Crown
                    size={12}
                    className="ml-1 inline align-[-1px]"
                    color="var(--gold)"
                    aria-label="방장"
                  />
                )}
                {p.benched && (
                  <span className="ml-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                    대기
                  </span>
                )}
                {!p.connected && (
                  <span className="ml-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                    끊김
                  </span>
                )}
              </span>

              <ScoreNumber value={score} highlight={first} />

              {/* 1등이 바뀌는 순간에만 반짝인다. 계속 빛나면 눈이 피로하다 */}
              {first && motionOk && (
                <m.span
                  key={`crown-${p.playerId}`}
                  className="pointer-events-none absolute inset-0 rounded-lg"
                  style={{ background: 'var(--gold)' }}
                  initial={{ opacity: 0.18 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  aria-hidden
                />
              )}
            </m.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
