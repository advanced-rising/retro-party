'use client'

import { m } from 'motion/react'
import { Crown, Medal } from 'lucide-react'
import type { Participant, PlayerId, TeamId } from '@retro/types'
import { Avatar } from '@/components/Avatar'
import { SPRING_SETTLE, transitionFor, useMotionOk } from '@/lib/motion'

/**
 * 결과 시상대.
 *
 * 판이 끝나는 순간이 [한 판 더] 를 누르느냐 나가느냐가 갈리는 지점이다.
 * 이름과 숫자만 나열하면 아무 일도 안 일어난 것처럼 끝난다 —
 * 1·2·3등을 눈으로 확인시키고, **내가 몇 등인지**를 반드시 알려준다.
 */
export function Podium({
  participants,
  scores,
  you,
  teamMode,
}: {
  participants: readonly Participant[]
  scores: ReadonlyMap<PlayerId, number>
  you: PlayerId | null
  teamMode: boolean
}) {
  const motionOk = useMotionOk()
  const ranked = [...participants]
    .filter((p) => !p.benched)
    .sort((a, b) => (scores.get(b.playerId) ?? 0) - (scores.get(a.playerId) ?? 0))

  if (ranked.length === 0) return null

  const myRank = ranked.findIndex((p) => p.playerId === you)
  const top = ranked.slice(0, 3)
  // 시상대는 2 · 1 · 3 순서로 세운다. 가운데가 1등이어야 시상대로 읽힌다
  const order = [top[1], top[0], top[2]].filter((p): p is Participant => p !== undefined)
  const heights = new Map<string, number>([
    [top[0]?.playerId ?? '', 68],
    [top[1]?.playerId ?? '', 48],
    [top[2]?.playerId ?? '', 36],
  ])

  return (
    <section className="w-full">
      {teamMode && <TeamTotals participants={participants} scores={scores} />}

      <div className="flex items-end justify-center gap-2">
        {order.map((p, i) => {
          const rank = ranked.indexOf(p)
          const score = scores.get(p.playerId) ?? 0
          const mine = p.playerId === you
          return (
            <m.div
              key={p.playerId}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              style={{ maxWidth: 110 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitionFor(motionOk, SPRING_SETTLE), delay: 0.1 + i * 0.12 }}
            >
              {rank === 0 ? (
                <Crown size={18} color="var(--gold)" aria-label="1등" />
              ) : (
                <Medal size={15} color="var(--text-lo)" aria-label={`${rank + 1}등`} />
              )}

              <Avatar participant={p} size={34} />

              <span
                className="w-full truncate text-center text-xs font-semibold"
                style={{ color: mine ? 'var(--lime)' : 'var(--text-hi)' }}
              >
                {p.nickname}
              </span>

              <span
                className="tnum text-sm font-bold"
                style={{ color: rank === 0 ? 'var(--gold)' : 'var(--text-lo)' }}
              >
                {score.toLocaleString('ko-KR')}
              </span>

              <m.span
                className="w-full rounded-t-md"
                style={{
                  background: rank === 0 ? 'var(--gold)' : 'var(--border)',
                  opacity: rank === 0 ? 0.85 : 0.5,
                }}
                initial={{ height: 0 }}
                animate={{ height: heights.get(p.playerId) ?? 30 }}
                transition={{ ...transitionFor(motionOk, SPRING_SETTLE), delay: 0.2 + i * 0.12 }}
              />
            </m.div>
          )
        })}
      </div>

      {/* 3등 밖이면 시상대에 없다. 그래도 자기 순위는 알아야 한다 */}
      {myRank >= 3 && (
        <p className="mt-3 text-center text-sm" style={{ color: 'var(--text-lo)' }}>
          당신은{' '}
          <strong className="tnum" style={{ color: 'var(--text-hi)' }}>
            {myRank + 1}등
          </strong>{' '}
          / {ranked.length}명
        </p>
      )}
    </section>
  )
}

/** 팀전인데 팀 점수가 안 보이면 팀전이 아니다 */
function TeamTotals({
  participants,
  scores,
}: {
  participants: readonly Participant[]
  scores: ReadonlyMap<PlayerId, number>
}) {
  const totals = new Map<TeamId, number>([
    [0, 0],
    [1, 0],
  ])
  for (const p of participants) {
    if (p.team === null) continue
    totals.set(p.team, (totals.get(p.team) ?? 0) + (scores.get(p.playerId) ?? 0))
  }

  const blue = totals.get(0) ?? 0
  const red = totals.get(1) ?? 0
  const winner = blue === red ? null : blue > red ? 0 : 1

  return (
    <div className="mb-4 flex items-center justify-center gap-3">
      <TeamSide label="청팀" score={blue} color="var(--blue)" won={winner === 0} />
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
        {winner === null ? '무승부' : 'vs'}
      </span>
      <TeamSide label="홍팀" score={red} color="var(--red)" won={winner === 1} />
    </div>
  )
}

function TeamSide({
  label,
  score,
  color,
  won,
}: {
  label: string
  score: number
  color: string
  won: boolean
}) {
  return (
    <span
      className="flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5"
      style={{
        background: won ? 'var(--bg-elevated)' : 'transparent',
        borderColor: won ? color : 'var(--border)',
      }}
    >
      <span className="text-xs font-semibold" style={{ color }}>
        {label}
      </span>
      <span className="tnum text-base font-bold" style={{ color: 'var(--text-hi)' }}>
        {score.toLocaleString('ko-KR')}
      </span>
    </span>
  )
}
