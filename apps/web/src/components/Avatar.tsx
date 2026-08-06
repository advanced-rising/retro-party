import type { Participant } from '@retro/types'
import { avatarIcon } from '@/lib/avatar'

/** 팀 색은 아이콘에 직접 입힌다. 색만으로 정보를 주지 않으려 이름도 항상 함께 보인다 */
export function Avatar({
  participant,
  size = 28,
  presenting = false,
}: {
  participant: Participant
  size?: number
  presenting?: boolean
}) {
  const Icon = avatarIcon(participant.avatarIcon)
  const tint =
    participant.team === 0 ? 'var(--blue)' : participant.team === 1 ? 'var(--red)' : 'var(--text-lo)'

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg border"
      style={{
        width: size,
        height: size,
        background: 'var(--bg-elevated)',
        borderColor: presenting ? 'var(--purple)' : 'var(--border)',
        borderWidth: presenting ? 2 : 1,
        opacity: participant.connected ? 1 : 0.4,
      }}
    >
      <Icon size={Math.round(size * 0.55)} color={tint} strokeWidth={2} aria-hidden />
    </span>
  )
}
