import { Crown } from 'lucide-react'
import type { Participant, PlayerId } from '@retro/types'
import { Avatar } from '@/components/Avatar'

/**
 * 참가자 목록 — 06 문서 §6
 *
 * 여기 보이는 사람은 전부 실제 접속자다. 자리를 채워 넣는 표시는 없다 (03 문서).
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
  const ranked = [...participants].sort(
    (a, b) => (scores.get(b.playerId) ?? 0) - (scores.get(a.playerId) ?? 0),
  )
  const leader = ranked[0]
  const top = leader === undefined ? 0 : (scores.get(leader.playerId) ?? 0)

  return (
    <ul className="space-y-1" aria-label={`참가자 ${participants.length}명`}>
      {ranked.map((p) => {
        const score = scores.get(p.playerId) ?? 0
        const first = top > 0 && score === top
        return (
          <li
            key={p.playerId}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              background: p.playerId === you ? 'var(--bg-elevated)' : 'transparent',
              opacity: p.benched ? 0.55 : 1,
            }}
          >
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

            <span
              className="tnum text-sm font-semibold"
              style={{ color: first ? 'var(--gold)' : 'var(--text-lo)' }}
            >
              {score}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
