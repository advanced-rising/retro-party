'use client'

import { m } from 'motion/react'
import { CircleSlash } from 'lucide-react'
import type { Participant, RoundRecord } from '@retro/types'
import { STAGGER_STEP, TWEEN_QUICK, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 정답 기록 — 판이 끝나고 되짚어 보는 화면.
 *
 * "아 그거였어?" 가 여기서 나온다. 놓친 문제를 다시 보는 그 순간이
 * [한 판 더] 를 누르게 만든다 (02 문서 §1.4 의 정산 카드와 같은 이유).
 *
 * 정답은 **공개된 라운드만** 서버가 보내준다. 진행 중에는 이 목록이 비어 있다.
 */
export function MatchHistory({
  rounds,
  participants,
}: {
  rounds: readonly RoundRecord[]
  participants: readonly Participant[]
}) {
  const motionOk = useMotionOk()
  if (rounds.length === 0) return null

  const nameOf = (id: string): string =>
    participants.find((p) => p.playerId === id)?.nickname ?? '나간 사람'

  const solvedCount = rounds.filter((r) => r.solvers.length > 0).length

  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
        정답 기록
        <span className="tnum text-xs font-normal" style={{ color: 'var(--text-dim)' }}>
          {rounds.length}라운드 · {solvedCount}개 맞힘
        </span>
      </h2>

      <m.ol
        className="space-y-1"
        initial="hidden"
        animate="shown"
        variants={{ shown: { transition: { staggerChildren: STAGGER_STEP } } }}
      >
        {rounds.map((round) => {
          const winner = round.solvers[0]
          return (
            <m.li
              key={round.roundNo}
              variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
              transition={transitionFor(motionOk, TWEEN_QUICK)}
              className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
              style={{ background: 'var(--bg-surface)' }}
            >
              <span className="tnum w-5 shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                {round.roundNo + 1}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold"
                style={{ color: 'var(--text-hi)' }}
              >
                {round.answer}
              </span>

              {winner === undefined ? (
                <span
                  className="flex shrink-0 items-center gap-1 text-xs"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <CircleSlash size={11} aria-hidden />
                  아무도 못 맞힘
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-xs">
                  <span className="max-w-24 truncate" style={{ color: 'var(--lime)' }}>
                    {nameOf(winner.playerId)}
                  </span>
                  <span className="tnum" style={{ color: 'var(--text-dim)' }}>
                    {(winner.elapsedMs / 1000).toFixed(1)}초
                  </span>
                  {round.solvers.length > 1 && (
                    <span className="tnum" style={{ color: 'var(--text-dim)' }}>
                      외 {round.solvers.length - 1}명
                    </span>
                  )}
                </span>
              )}
            </m.li>
          )
        })}
      </m.ol>
    </section>
  )
}
