'use client'

import { use, useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, Lock, Users, WifiOff } from 'lucide-react'
import { asPlayerId, ROOM_CAPACITY, type PlayerId } from '@retro/types'
import { Board } from '@/components/Board'
import { ChatPanel } from '@/components/ChatPanel'
import { InAppBanner } from '@/components/InAppBanner'
import { Roster } from '@/components/Roster'
import { Timer } from '@/components/Timer'
import { fetchRoomState, requestTicket } from '@/lib/api'
import { API_BASE, loadIdentity } from '@/lib/identity'
import { useRoomSocket } from '@/lib/room-socket'

/**
 * 방 화면 — 06 문서 §6
 *
 * 세로 배치가 기준이다. 채팅이 입력 장치라 모바일에서 입력창이
 * 언제나 화면 아래에 붙어 있어야 한다 (dvh + flex 로 잡는다).
 */
export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = use(params)
  const code = raw.toUpperCase()

  const [identity, setIdentity] = useState<{ playerId: string; nickname: string } | null>(null)
  const [locked, setLocked] = useState<boolean | null>(null)
  const [ticket, setTicket] = useState<string | null>(null)

  useEffect(() => {
    setIdentity(loadIdentity())
    void fetchRoomState(code)
      .then((state) => setLocked(state?.locked ?? false))
      .catch(() => setLocked(false))
  }, [code])

  if (identity === null || locked === null) return <Splash />

  // 잠긴 방은 티켓을 받아야 소켓을 연다. 비밀번호는 URL 에 실리지 않는다
  if (locked && ticket === null) {
    return <PasswordGate code={code} onTicket={setTicket} />
  }

  return <Room code={code} identity={identity} ticket={ticket} />
}

function PasswordGate({
  code,
  onTicket,
}: {
  code: string
  onTicket: (ticket: string) => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const issued = await requestTicket(code, password)
      if (issued === null) throw new Error('입장할 수 없습니다')
      onTicket(issued)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '비밀번호가 다릅니다')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-sm flex-col justify-center gap-4 px-5">
      <InAppBanner />
      <h1
        className="flex items-center gap-2 text-lg font-bold"
        style={{ color: 'var(--text-hi)' }}
      >
        <Lock size={16} color="var(--amber)" aria-hidden />
        비밀번호가 걸린 방입니다
      </h1>

      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          maxLength={20}
          autoFocus
          autoComplete="off"
          aria-label="방 비밀번호"
          className="w-full rounded-lg border px-3 py-2.5 text-base outline-none"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-hi)' }}
        />
        <button
          type="submit"
          disabled={busy || password.trim().length === 0}
          className="w-full rounded-xl py-3 text-base font-bold disabled:opacity-50"
          style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
        >
          들어가기
        </button>
      </form>

      {error !== null && (
        <p className="text-sm" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}
    </main>
  )
}

function Room({
  code,
  identity,
  ticket,
}: {
  code: string
  identity: { playerId: string; nickname: string }
  ticket: string | null
}) {
  const [view, actions] = useRoomSocket(
    API_BASE,
    code,
    identity.playerId,
    identity.nickname,
    ticket,
  )
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1_600)
  }, [])

  const isHost = view.you !== null && view.you === view.hostId
  const teamMode = view.settings?.mode === 'team'
  const solo = view.settings?.mode === 'solo'
  const here = view.participants.filter((p) => p.connected).length
  const needed = solo ? 1 : 2
  const roundMs = view.settings?.gameId === 'geuhae' ? 60_000 : view.settings?.gameId === 'assoc' ? 90_000 : 20_000

  // 단어 연상에서 지금 설명하는 사람
  const presenterId: PlayerId | null =
    typeof view.board === 'object' &&
    view.board !== null &&
    'presenter' in view.board &&
    typeof (view.board as { presenter?: unknown }).presenter === 'string'
      ? asPlayerId((view.board as { presenter: string }).presenter)
      : null
  const presenterName =
    view.participants.find((p) => p.playerId === presenterId)?.nickname ?? '출제자'

  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col px-4 pb-2 pt-3">
      <InAppBanner />

      <header className="flex items-center gap-2 pb-3">
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-bold tracking-[0.15em]"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
          aria-label="방 링크 복사"
        >
          {code}
          <Copy size={13} aria-hidden />
        </button>

        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-lo)' }}>
          {copied ? (
            <span style={{ color: 'var(--lime)' }} role="status">
              링크 복사됨
            </span>
          ) : (
            (view.settings?.title ?? '')
          )}
        </span>

        <span
          className="flex shrink-0 items-center gap-1.5 text-sm"
          style={{ color: 'var(--text-lo)' }}
        >
          {view.connected ? (
            <Users size={14} aria-hidden />
          ) : (
            <WifiOff size={14} color="var(--amber)" aria-hidden />
          )}
          <span className="tnum">
            {here}/{ROOM_CAPACITY}
          </span>
        </span>
      </header>

      {view.phase.kind === 'playing' && (
        <div className="pb-3">
          <Timer endsAtMs={view.phase.endsAtMs} totalMs={roundMs} />
        </div>
      )}

      <Board board={view.board} phase={view.phase} presenterName={presenterName} />

      <div className="py-3">
        <Roster
          participants={view.participants}
          scores={view.scores}
          hostId={view.hostId}
          you={view.you}
          presenter={presenterId}
        />
      </div>

      {(view.phase.kind === 'lobby' || view.phase.kind === 'result') && (
        <div className="flex items-center gap-2 pb-3">
          <button
            type="button"
            onClick={view.phase.kind === 'result' ? actions.again : actions.start}
            disabled={!isHost || here < needed}
            className="flex-1 rounded-xl py-3 text-base font-bold disabled:opacity-40"
            style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
          >
            {view.phase.kind === 'result' ? '한 판 더' : '시작'}
          </button>

          {isHost && view.phase.kind === 'lobby' && !solo && (
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

      {here < needed && view.phase.kind === 'lobby' && (
        <p className="pb-3 text-center text-sm" style={{ color: 'var(--text-lo)' }}>
          방 코드를 보내면 {needed}명부터 바로 시작할 수 있습니다
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
