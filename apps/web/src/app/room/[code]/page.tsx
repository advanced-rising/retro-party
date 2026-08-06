'use client'

import { use, useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  Copy,
  FastForward,
  Lightbulb,
  ListChecks,
  Lock,
  LogOut,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { asPlayerId, ROOM_CAPACITY, type PlayerId } from '@retro/types'
import { Board } from '@/components/Board'
import { ChatPanel } from '@/components/ChatPanel'
import { InAppBanner } from '@/components/InAppBanner'
import { MatchHistory } from '@/components/MatchHistory'
import { Roster } from '@/components/Roster'
import { Timer } from '@/components/Timer'
import { fetchRoomState, requestTicket } from '@/lib/api'
import { gameIcon } from '@/lib/game-icon'
import { LevelBadge } from '@/components/LevelBadge'
import { API_BASE, addXp, loadIdentity, loadXp } from '@/lib/identity'
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
  const router = useRouter()
  const [view, actions] = useRoomSocket(
    API_BASE,
    code,
    identity.playerId,
    identity.nickname,
    ticket,
  )
  const [copied, setCopied] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [xp, setXp] = useState(0)

  useEffect(() => setXp(loadXp()), [])

  // 내 정답 줄이 새로 들어온 순간을 센다. 이 값이 오르면 이펙트가 터진다
  const myCorrects = view.lines.filter((l) => l.from === view.you && l.correct !== null).length

  /**
   * 판이 끝나면 얻은 점수만큼 경험치를 쌓는다.
   *
   * 서버가 아니라 브라우저에 쌓는다 — 계정과 DB 가 아직 없다.
   * 그래서 이 값은 표시용이고 랭크에 쓰지 않는다 (10 문서 §7).
   */
  const finished = view.phase.kind === 'result'
  const myScore = view.you === null ? 0 : (view.scores.get(view.you) ?? 0)
  useEffect(() => {
    if (!finished || myScore <= 0) return
    setXp(addXp(myScore))
  }, [finished, myScore])

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1_600)
  }, [])

  const GameIcon = gameIcon(GAME_ICONS[view.settings?.gameId ?? ''] ?? '')
  const isHost = view.you !== null && view.you === view.hostId
  const teamMode = view.settings?.mode === 'team'
  const solo = view.settings?.mode === 'solo'
  const here = view.participants.filter((p) => p.connected).length
  const needed = solo ? 1 : 2
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
    /**
     * 모바일은 한 칸, PC 는 두 칸.
     *
     * 좁은 화면에서는 문제 → 사람 → 채팅 순서로 쌓아야 엄지로 닿는 곳에
     * 입력창이 온다. 넓은 화면에서 같은 배치를 쓰면 가운데 한 줄만 쓰고
     * 양옆이 통째로 논다 — 그래서 문제와 대화를 좌우로 나눈다.
     */
    <main className="mx-auto flex h-dvh w-full max-w-lg flex-col px-4 pb-2 pt-3 lg:max-w-6xl lg:px-6">
      <InAppBanner />

      <header className="flex flex-wrap items-center gap-2 pb-3">
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

        <LevelBadge xp={xp} compact />

        <GameIcon size={16} className="shrink-0" color="var(--text-lo)" aria-hidden />

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

        {/* 지나온 문제 다시 보기. 무제한 판에서는 이게 유일한 통로다 */}
        {view.history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold"
            style={{
              background: showHistory ? 'var(--lime-wash)' : 'var(--bg-elevated)',
              borderColor: showHistory ? 'var(--lime)' : 'var(--border)',
              color: showHistory ? 'var(--lime)' : 'var(--text-lo)',
            }}
            aria-label="정답 기록 보기"
            aria-pressed={showHistory}
          >
            <ListChecks size={13} aria-hidden />
            <span className="tnum">{view.history.length}</span>
          </button>
        )}

        {/* 나가기. 소켓이 닫히면 서버가 알아서 정리한다 (engine.leave) */}
        <button
          type="button"
          onClick={() => router.push('/')}
          className="shrink-0 rounded-lg border p-1.5"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          aria-label="방 나가기"
          title="방 나가기"
        >
          <LogOut size={14} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row lg:gap-6">
        {/* 왼쪽 — 문제. 넓은 화면에서 더 많은 폭을 가져간다 */}
        <div className="flex min-h-0 flex-col lg:flex-[1.5] lg:overflow-y-auto">
      {view.phase.kind === 'playing' && (
        <div className="flex items-center gap-2 pb-3">
          <div className="min-w-0 flex-1">
            <Timer endsAtMs={view.phase.endsAtMs} totalMs={view.phase.roundMs} />
          </div>

          {/*
            스킵 — 아무도 못 맞히고 있을 때 남은 시간을 통째로 버리지 않게 한다.
            판단은 서버가 한다. 이미 맞힌 사람은 자동으로 동의한 것으로 센다
          */}
          {/* 다음 힌트 먼저 보기 — 과반이면 시계를 당긴다. 점수도 그만큼 깎인다 */}
          {view.hint.available && (
            <button
              type="button"
              onClick={actions.hint}
              disabled={view.hint.you}
              className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-60"
              style={{
                background: view.hint.you ? 'var(--lime-wash)' : 'var(--bg-elevated)',
                borderColor: view.hint.you ? 'var(--lime)' : 'var(--border)',
                color: view.hint.you ? 'var(--lime)' : 'var(--text-lo)',
              }}
              aria-label="다음 힌트 먼저 보기에 투표"
              title="과반이 누르면 다음 힌트가 바로 열립니다. 남은 시간과 점수도 줄어요"
            >
              <Lightbulb size={12} aria-hidden />
              힌트
              {view.hint.needed > 0 && (
                <span className="tnum">
                  {view.hint.votes}/{view.hint.needed}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={actions.skip}
            disabled={view.skip.you}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-60"
            style={{
              background: view.skip.you ? 'var(--lime-wash)' : 'var(--bg-elevated)',
              borderColor: view.skip.you ? 'var(--lime)' : 'var(--border)',
              color: view.skip.you ? 'var(--lime)' : 'var(--text-lo)',
            }}
            aria-label="이 문제 넘기기에 투표"
            title="모두 누르면 5초 뒤에 정답이 공개됩니다"
          >
            <FastForward size={12} aria-hidden />
            넘기기
            {view.skip.needed > 0 && (
              <span className="tnum">
                {view.skip.votes}/{view.skip.needed}
              </span>
            )}
          </button>
        </div>
      )}

      <Board
        board={view.board}
        phase={view.phase}
        presenterName={presenterName}
        gameId={view.settings?.gameId ?? ''}
        roomCode={code}
        strokes={view.strokes}
        onStroke={actions.stroke}
        onCanvas={actions.canvas}
        onAnswer={(text) => actions.send(text, teamMode ? 'team' : 'all')}
        correctAt={myCorrects}
      />

      {/* 결과 화면에서는 항상, 진행 중에는 버튼을 눌렀을 때만 */}
      {(view.phase.kind === 'result' || showHistory) && view.history.length > 0 && (
        <div className="relative min-h-0 overflow-y-auto py-3">
          {showHistory && view.phase.kind !== 'result' && (
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="absolute right-0 top-3 rounded-md border p-1"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
              aria-label="기록 닫기"
            >
              <X size={12} aria-hidden />
            </button>
          )}
          <MatchHistory rounds={view.history} participants={view.participants} />
        </div>
      )}

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
        </div>

        {/* 오른쪽 — 사람과 대화. 좁은 화면에서는 문제 아래로 내려온다 */}
        <aside className="flex min-h-0 flex-1 flex-col lg:max-w-sm">
          <div className="shrink-0 py-3 lg:pt-0">
            <Roster
              participants={view.participants}
              scores={view.scores}
              hostId={view.hostId}
              you={view.you}
              presenter={presenterId}
            />
          </div>

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
        </aside>
      </div>
    </main>
  )
}

/** 방 화면은 게임 목록을 안 받으므로 아이콘 이름을 여기서 안다 */
const GAME_ICONS: Readonly<Record<string, string>> = {
  chosung: 'spell-check',
  geuhae: 'calendar-clock',
  assoc: 'messages-square',
  mulga: 'coins',
  sketch: 'pencil',
  timeline: 'list-ordered',
  oxquiz: 'circle-slash',
  kkungtta: 'link',
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
