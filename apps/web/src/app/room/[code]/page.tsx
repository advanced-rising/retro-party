'use client'

import { use, useEffect, useState } from 'react'
import { Copy, Users, WifiOff } from 'lucide-react'
import { ROOM_CAPACITY } from '@retro/types'
import { Board } from '@/components/Board'
import { ChatPanel } from '@/components/ChatPanel'
import { Roster } from '@/components/Roster'
import { Timer } from '@/components/Timer'
import { API_BASE, loadIdentity } from '@/lib/identity'
import { useRoomSocket } from '@/lib/room-socket'

/**
 * 방 화면 — 06 문서 §6
 *
 * 세로 배치가 기준이다. 채팅이 입력 장치라 모바일에서 입력창이
 * 언제나 화면 아래에 붙어 있어야 한다 (dvh + flex 로 잡는다).
 */
export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const [identity, setIdentity] = useState<{ playerId: string; nickname: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setIdentity(loadIdentity())
  }, [])

  if (identity === null) return <Splash />

  return (
    <Room
      code={code.toUpperCase()}
      playerId={identity.playerId}
      nickname={identity.nickname}
      copied={copied}
      onCopy={() => {
        void navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 1_600)
      }}
    />
  )
}

function Room({
  code,
  playerId,
  nickname,
  copied,
  onCopy,
}: {
  code: string
  playerId: string
  nickname: string
  copied: boolean
  onCopy: () => void
}) {
  const [view, actions] = useRoomSocket(API_BASE, code, playerId, nickname)
  const isHost = view.you !== null && view.you === view.hostId
  const teamMode = view.settings?.mode === 'team'
  const playing = view.phase.kind === 'playing'
  const here = view.participants.filter((p) => p.connected).length

  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col px-4 pb-2 pt-3">
      <header className="flex items-center gap-3 pb-3">
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-bold tracking-[0.15em]"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
          aria-label="방 링크 복사"
        >
          {code}
          <Copy size={13} aria-hidden />
        </button>
        {copied && (
          <span className="text-xs" style={{ color: 'var(--lime)' }} role="status">
            링크 복사됨
          </span>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-lo)' }}>
          {view.connected ? <Users size={14} aria-hidden /> : <WifiOff size={14} color="var(--amber)" aria-hidden />}
          <span className="tnum">
            {here}/{ROOM_CAPACITY}
          </span>
        </span>
      </header>

      {playing && (
        <div className="pb-3">
          <Timer endsAtMs={view.phase.endsAtMs} totalMs={20_000} />
        </div>
      )}

      <Board board={view.board} phase={view.phase} />

      <div className="py-3">
        <Roster
          participants={view.participants}
          scores={view.scores}
          hostId={view.hostId}
          you={view.you}
        />
      </div>

      {(view.phase.kind === 'lobby' || view.phase.kind === 'result') && (
        <div className="flex items-center gap-2 pb-3">
          <button
            type="button"
            onClick={view.phase.kind === 'result' ? actions.again : actions.start}
            disabled={!isHost || here < 2}
            className="flex-1 rounded-xl py-3 text-base font-bold disabled:opacity-40"
            style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
          >
            {view.phase.kind === 'result' ? '한 판 더' : '시작'}
          </button>

          {isHost && view.phase.kind === 'lobby' && (
            <button
              type="button"
              onClick={() => actions.patchSettings({ mode: teamMode ? 'casual' : 'team' })}
              className="rounded-xl border px-4 py-3 text-sm font-semibold"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
            >
              {teamMode ? '개인전으로' : '팀전으로'}
            </button>
          )}
        </div>
      )}

      {!isHost && view.phase.kind === 'lobby' && (
        <p className="pb-3 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          방장이 시작하기를 기다리는 중…
        </p>
      )}

      {here < 2 && view.phase.kind === 'lobby' && (
        <p className="pb-3 text-center text-sm" style={{ color: 'var(--text-lo)' }}>
          링크를 보내면 2명부터 바로 시작할 수 있습니다
        </p>
      )}

      <ChatPanel
        lines={view.lines}
        participants={view.participants}
        you={view.you}
        teamMode={teamMode}
        disabled={!view.connected}
        onSend={actions.send}
      />

      {view.error !== null && (
        <p className="pb-1 text-center text-xs" style={{ color: 'var(--red)' }} role="alert">
          {view.error}
        </p>
      )}
    </main>
  )
}

function Splash() {
  return (
    <main className="flex h-dvh items-center justify-center">
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        방으로 들어가는 중…
      </p>
    </main>
  )
}
