import { CircleCheck, Lightbulb } from 'lucide-react'
import type { RoomPhase } from '@retro/types'
import { isRevealBoard } from '@retro/room-kit/client-state'
import { isChosungBoard } from '@/lib/room-socket'

/**
 * 문제 영역 — 06 문서 §6
 *
 * 여기 그려지는 것은 전부 서버가 `viewFor` 로 걸러 보낸 값이다.
 * 클라이언트가 정답을 알거나 계산하는 경로는 없다.
 */
export function Board({ board, phase }: { board: unknown; phase: RoomPhase }) {
  if (phase.kind === 'lobby') {
    return (
      <Frame>
        <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
          방장이 시작하면 첫 문제가 나옵니다
        </p>
      </Frame>
    )
  }

  if (phase.kind === 'countdown') {
    return (
      <Frame>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
          곧 시작합니다
        </p>
      </Frame>
    )
  }

  if (phase.kind === 'result') {
    return (
      <Frame>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
          한 판 끝
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-lo)' }}>
          [한 판 더] 를 누르면 이 방에서 이어서 합니다
        </p>
      </Frame>
    )
  }

  if (isRevealBoard(board)) {
    return (
      <Frame>
        <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
          정답
        </p>
        <p className="mt-2 text-4xl font-bold" style={{ color: 'var(--lime)' }}>
          {board.revealed}
        </p>
      </Frame>
    )
  }

  if (!isChosungBoard(board)) {
    return (
      <Frame>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          문제를 받는 중…
        </p>
      </Frame>
    )
  }

  return (
    <Frame>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {board.category} · {board.length}글자
      </p>

      <p
        className="mt-3 text-5xl font-bold tracking-[0.2em] sm:text-6xl"
        style={{ color: 'var(--text-hi)' }}
        aria-label={`초성 ${board.chosung.split('').join(' ')}`}
      >
        {board.chosung}
      </p>

      <div className="mt-4 flex min-h-6 flex-col items-center gap-1">
        {board.hint !== null && (
          <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-lo)' }}>
            <Lightbulb size={14} aria-hidden />
            {board.hint}
          </p>
        )}
        {board.firstVowel !== null && (
          <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
            첫 글자 모음 <strong style={{ color: 'var(--text-hi)' }}>{board.firstVowel}</strong>
          </p>
        )}
      </div>

      <p
        className="mt-4 flex items-center justify-center gap-1.5 text-sm"
        style={{ color: board.youSolved ? 'var(--lime)' : 'var(--text-dim)' }}
      >
        {board.youSolved && <CircleCheck size={14} aria-hidden />}
        {board.youSolved ? '맞혔습니다' : `${board.solvedCount}명이 맞혔습니다`}
      </p>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex min-h-44 flex-col items-center justify-center rounded-xl border px-5 py-8 text-center"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      aria-live="polite"
    >
      {children}
    </section>
  )
}
