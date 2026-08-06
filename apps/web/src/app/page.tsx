'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, RefreshCw, User, Users, Zap } from 'lucide-react'
import type { RoomSummary } from '@retro/types'
import { InAppBanner } from '@/components/InAppBanner'
import { createRoom, fetchGames, fetchRooms, quickJoinTarget, type GameInfo } from '@/lib/api'
import { loadIdentity, saveNickname } from '@/lib/identity'

/**
 * 첫 화면 — 03 문서 §4
 *
 * 순서가 곧 정책이다.
 *   1. [바로 참가]   — 판단을 없애고 사람 많은 방에 그냥 넣는다
 *   2. 방 목록        — 사람 수 내림차순. 빈 방은 서버가 안 보낸다
 *   3. 방 만들기      — 3순위. 여기가 1순위가 되면 동접이 흩어진다
 *   4. 혼자 하기      — 방이 하나도 없을 때의 대기실
 */
export default function Home() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [games, setGames] = useState<readonly GameInfo[]>([])
  const [rooms, setRooms] = useState<readonly RoomSummary[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      setRooms(await fetchRooms())
    } catch {
      // 목록이 잠깐 안 와도 화면은 살아 있어야 한다
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setNickname(loadIdentity().nickname)
    void fetchGames()
      .then(setGames)
      .catch(() => undefined)
    void reload()
    const timer = setInterval(() => void reload(), 5_000)
    return () => clearInterval(timer)
  }, [reload])

  const go = (target: string): void => {
    saveNickname(nickname)
    router.push(`/room/${target}`)
  }

  async function quickJoin(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      saveNickname(nickname)
      const existing = await quickJoinTarget()
      if (existing !== null) {
        go(existing)
        return
      }

      // 갈 방이 없으면 하나 만들어서 연다. 빈손으로 돌려보내지 않는다
      go(
        await createRoom({
          title: `${nickname}의 방`,
          gameId: games[0]?.id ?? 'chosung',
          mode: 'casual',
          rounds: 5,
          isPublic: true,
          password: '',
        }),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '연결에 실패했습니다')
      setBusy(false)
    }
  }

  const totalPlayers = rooms.reduce((sum, room) => sum + room.players, 0)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <InAppBanner />

      <header>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-hi)' }}>
          손이심심
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--text-lo)' }}>
          채팅창이 곧 정답 입력이다. 먼저 외치는 사람이 이긴다.
        </p>
      </header>

      <section className="space-y-2">
        <label
          htmlFor="nickname"
          className="block text-xs font-semibold"
          style={{ color: 'var(--text-dim)' }}
        >
          닉네임
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className="w-full rounded-lg border px-3 py-2.5 text-base outline-none"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-hi)' }}
        />
      </section>

      <button
        type="button"
        onClick={() => void quickJoin()}
        disabled={busy || nickname.trim().length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold disabled:opacity-50"
        style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <Zap size={18} aria-hidden />
        )}
        바로 참가
      </button>

      {error !== null && (
        <p className="text-sm" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}

      {/* 방 목록 — 정렬은 서버가 정한다. 사람 수 내림차순 고정 */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
            지금 열린 방
          </h2>
          {totalPlayers > 0 && (
            <span className="tnum text-xs" style={{ color: 'var(--lime)' }}>
              {totalPlayers}명 접속 중
            </span>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            className="ml-auto"
            aria-label="목록 새로고침"
          >
            <RefreshCw
              size={14}
              color="var(--text-dim)"
              className={refreshing ? 'animate-spin' : ''}
              aria-hidden
            />
          </button>
        </div>

        {rooms.length === 0 ? (
          <p
            className="rounded-lg border border-dashed px-3 py-6 text-center text-sm"
            style={{ color: 'var(--text-dim)' }}
          >
            아직 열린 방이 없습니다.
            <br />
            [바로 참가] 를 누르면 방을 하나 열어 드려요
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rooms.map((room) => (
              <RoomRow key={room.code} room={room} games={games} onEnter={() => go(room.code)} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="방 코드"
            aria-label="방 코드"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-base tracking-[0.3em] outline-none"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-hi)' }}
          />
          <button
            type="button"
            onClick={() =>
              code.trim().length === 6 ? go(code.trim()) : setError('방 코드는 6자리입니다')
            }
            className="shrink-0 rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
          >
            코드로 입장
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="w-full rounded-lg border py-2.5 text-sm font-semibold"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
        >
          방 만들기
        </button>
      </section>

      {creating && (
        <CreateRoomForm
          games={games}
          nickname={nickname}
          openRooms={rooms.length}
          onCreated={go}
          onError={setError}
        />
      )}

      <SoloSection games={games} nickname={nickname} onCreated={go} />
    </main>
  )
}

function RoomRow({
  room,
  games,
  onEnter,
}: {
  room: RoomSummary
  games: readonly GameInfo[]
  onEnter: () => void
}) {
  const gameName = games.find((g) => g.id === room.gameId)?.name ?? room.gameId
  const full = room.players >= room.capacity
  const playing = room.phase !== 'lobby' && room.phase !== 'result'

  return (
    <li>
      <button
        type="button"
        onClick={onEnter}
        disabled={full}
        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left disabled:opacity-45"
        style={{ background: 'var(--bg-surface)' }}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {room.locked && <Lock size={12} color="var(--amber)" aria-label="비밀번호" />}
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>
              {room.title}
            </span>
          </span>
          <span
            className="mt-0.5 flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--text-dim)' }}
          >
            {gameName}
            {room.mode === 'team' && <span style={{ color: 'var(--blue)' }}>팀전</span>}
            {playing && <span>진행 중</span>}
          </span>
        </span>

        <span
          className="tnum flex shrink-0 items-center gap-1 text-sm font-semibold"
          style={{ color: full ? 'var(--text-dim)' : 'var(--lime)' }}
        >
          <Users size={13} aria-hidden />
          {room.players}/{room.capacity}
        </span>
      </button>
    </li>
  )
}

const ROUND_CHOICES = [3, 5, 10] as const

function CreateRoomForm({
  games,
  nickname,
  openRooms,
  onCreated,
  onError,
}: {
  games: readonly GameInfo[]
  nickname: string
  openRooms: number
  onCreated: (code: string) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState('')
  const [gameId, setGameId] = useState('')
  const [mode, setMode] = useState<'casual' | 'team'>('casual')
  const [rounds, setRounds] = useState(5)
  const [password, setPassword] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (gameId === '' && games[0] !== undefined) setGameId(games[0].id)
  }, [games, gameId])

  async function submit(): Promise<void> {
    setBusy(true)
    try {
      onCreated(
        await createRoom({
          title: title.trim().length > 0 ? title : `${nickname}의 방`,
          gameId,
          mode,
          rounds,
          isPublic,
          password,
        }),
      )
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '방을 만들지 못했습니다')
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ background: 'var(--bg-surface)' }}>
      {/* 뭉치기 압력 — 막지 않고 한 번만 되묻는다 (03 문서 §4.2) */}
      {openRooms > 0 && (
        <p className="text-xs" style={{ color: 'var(--amber)' }}>
          지금 사람이 있는 방이 {openRooms}개 있어요. 새 방은 혼자 기다리게 됩니다
        </p>
      )}

      <Field label="방 제목">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={20}
          placeholder={`${nickname}의 방`}
          className="w-full rounded-lg border px-3 py-2 text-base outline-none"
          style={{ background: 'var(--bg-base)', color: 'var(--text-hi)' }}
        />
      </Field>

      <Field label="게임">
        <div className="space-y-1.5">
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => setGameId(game.id)}
              className="flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left"
              style={{
                background: gameId === game.id ? 'var(--lime-wash)' : 'var(--bg-base)',
                borderColor: gameId === game.id ? 'var(--lime)' : 'var(--border)',
              }}
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block text-sm font-semibold"
                  style={{ color: gameId === game.id ? 'var(--lime)' : 'var(--text-hi)' }}
                >
                  {game.name}
                </span>
                <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>
                  {game.tagline}
                </span>
              </span>
              <span className="tnum shrink-0 text-xs" style={{ color: 'var(--text-dim)' }}>
                {Math.round(game.roundMs / 1000)}초
              </span>
            </button>
          ))}
        </div>
      </Field>

      <div className="flex gap-3">
        <Field label="모드">
          <Segmented
            options={[
              { value: 'casual', label: '개인전' },
              { value: 'team', label: '팀전' },
            ]}
            value={mode}
            onChange={(v) => setMode(v === 'team' ? 'team' : 'casual')}
          />
        </Field>

        <Field label="라운드">
          <Segmented
            options={ROUND_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(rounds)}
            onChange={(v) => setRounds(Number(v))}
          />
        </Field>
      </div>

      <Field label="비밀번호 (선택)">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          maxLength={20}
          autoComplete="off"
          placeholder="비워두면 누구나 들어옵니다"
          className="w-full rounded-lg border px-3 py-2 text-base outline-none"
          style={{ background: 'var(--bg-base)', color: 'var(--text-hi)' }}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-lo)' }}>
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="size-4"
        />
        방 목록에 공개
      </label>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || gameId === ''}
        className="w-full rounded-xl py-3 text-base font-bold disabled:opacity-50"
        style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
      >
        만들고 들어가기
      </button>
    </section>
  )
}

/** 혼자 모드는 본진이 아니라 대기실이다 — 03 문서 §7 */
function SoloSection({
  games,
  nickname,
  onCreated,
}: {
  games: readonly GameInfo[]
  nickname: string
  onCreated: (code: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function startSolo(gameId: string): Promise<void> {
    setBusy(true)
    try {
      onCreated(
        await createRoom({
          title: `${nickname} 혼자`,
          gameId,
          mode: 'solo',
          rounds: 5,
          isPublic: false,
          password: '',
        }),
      )
    } catch {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2 border-t pt-4">
      <h2
        className="flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--text-hi)' }}
      >
        <User size={14} aria-hidden />
        혼자 해보기
      </h2>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
        규칙을 익히기 좋습니다. 단어 연상은 설명이 자동으로 열립니다
      </p>

      <div className="flex flex-wrap gap-1.5">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            disabled={busy}
            onClick={() => void startSolo(game.id)}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
          >
            {game.name}
          </button>
        ))}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <span className="block text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="flex-1 rounded-lg border px-2 py-2 text-sm font-semibold"
          style={{
            background: value === option.value ? 'var(--lime-wash)' : 'var(--bg-base)',
            borderColor: value === option.value ? 'var(--lime)' : 'var(--border)',
            color: value === option.value ? 'var(--lime)' : 'var(--text-lo)',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
