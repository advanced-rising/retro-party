'use client'

import { motion } from 'motion/react'
import { CircleCheck } from 'lucide-react'
import type { RoomPhase } from '@retro/types'
import { isRevealBoard } from '@retro/room-kit/client-state'
import { AssocBoard, isAssocView } from '@/components/boards/AssocBoard'
import { ChosungBoard, isChosungView } from '@/components/boards/ChosungBoard'
import { GeuhaeBoard, isGeuhaeView } from '@/components/boards/GeuhaeBoard'
import { isMulgaView, MulgaBoard } from '@/components/boards/MulgaBoard'
import { Countdown } from '@/components/Countdown'
import { ReportButton } from '@/components/ReportButton'

/**
 * 문제 영역 — 06 문서 §6
 *
 * 여기 그려지는 것은 전부 서버가 `viewFor` 로 걸러 보낸 값이다.
 * 클라이언트가 정답을 알거나 계산하는 경로는 없다.
 *
 * 게임을 붙일 때 손대는 곳은 아래 분기 하나다 (09 문서 §6).
 */
export function Board({
  board,
  phase,
  presenterName,
  gameId,
  roomCode,
}: {
  board: unknown
  phase: RoomPhase
  presenterName: string
  gameId: string
  roomCode: string
}) {
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
        <Countdown startsAtMs={phase.startsAtMs} />
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
        <motion.p
          className="mt-2 text-4xl font-bold"
          style={{ color: 'var(--lime)' }}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          {board.revealed}
        </motion.p>
        <RevealCard detail={board.detail} />
        {/* 사실을 다루는 게임은 틀린 문항이 반드시 나온다. 그 자리에서 신고받는다 */}
        <ReportButton gameId={gameId} subject={board.revealed} roomCode={roomCode} />
      </Frame>
    )
  }

  if (isChosungView(board)) {
    return (
      <Frame>
        <ChosungBoard view={board} />
        <Solved count={board.solvedCount} you={board.youSolved} />
      </Frame>
    )
  }

  if (isGeuhaeView(board)) {
    return (
      <Frame>
        <GeuhaeBoard view={board} />
        <Solved count={board.solvedCount} you={board.youSolved} />
      </Frame>
    )
  }

  if (isMulgaView(board)) {
    return (
      <Frame>
        <MulgaBoard view={board} />
        <Solved count={board.solvedCount} you={board.youSolved} />
      </Frame>
    )
  }

  if (isAssocView(board)) {
    return (
      <Frame>
        <AssocBoard view={board} presenterName={presenterName} />
        <Solved
          count={board.solvedCount}
          you={board.role === 'guesser' ? board.youSolved : false}
        />
      </Frame>
    )
  }

  return (
    <Frame>
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        문제를 받는 중…
      </p>
    </Frame>
  )
}

/** 「그 해」 정산 카드 — 정산 화면이 대화를 만든다 (02 문서 §1.4) */
function RevealCard({ detail }: { detail: unknown }) {
  if (typeof detail !== 'object' || detail === null) return null
  const record = detail as Record<string, unknown>
  // 「그때 그 가격」 — 무엇의 가격이었는지 다시 보여준다
  if (typeof record['item'] === 'string' && typeof record['year'] === 'number') {
    return (
      <p className="mt-2 text-sm" style={{ color: 'var(--text-lo)' }}>
        <span className="tnum">{record['year']}</span>년 {record['item']}
      </p>
    )
  }

  const prices = Array.isArray(record['prices']) ? (record['prices'] as string[]) : []
  const events = Array.isArray(record['events']) ? (record['events'] as string[]) : []
  if (prices.length === 0 && events.length === 0) return null

  return (
    <div className="mt-4 w-full space-y-2 border-t pt-3 text-left">
      {prices.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm" style={{ color: 'var(--text)' }}>
          {prices.map((price) => (
            <span key={price}>{price}</span>
          ))}
        </p>
      )}
      {events.length > 0 && (
        <ul className="space-y-0.5 text-sm" style={{ color: 'var(--text-lo)' }}>
          {events.map((event) => (
            <li key={event}>· {event}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Solved({ count, you }: { count: number; you: boolean }) {
  return (
    <p
      className="mt-4 flex items-center justify-center gap-1.5 text-sm"
      style={{ color: you ? 'var(--lime)' : 'var(--text-dim)' }}
    >
      {you && <CircleCheck size={14} aria-hidden />}
      {you ? '맞혔습니다' : `${count}명이 맞혔습니다`}
    </p>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex min-h-44 flex-col items-center justify-center rounded-xl border px-5 py-6 text-center"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      aria-live="polite"
    >
      {children}
    </section>
  )
}
