'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { API_BASE, loadIdentity, saveNickname } from '@/lib/identity'

/**
 * 첫 화면 — 03 문서 §4.3
 *
 * 방 목록을 먼저 보여주지 않는다. 목록을 훑는 행동 자체가 이탈 지점이고,
 * 훑고 나면 대부분 "사람 적네" 로 끝난다. 판단을 없애고 그냥 넣는다.
 */
export default function Home() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNickname(loadIdentity().nickname)
  }, [])

  async function quickJoin(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      saveNickname(nickname)
      const response = await fetch(`${API_BASE}/api/rooms`, { method: 'POST' })
      if (!response.ok) throw new Error('방을 만들지 못했습니다')
      const body = (await response.json()) as { code?: string }
      if (typeof body.code !== 'string') throw new Error('방 코드를 못 받았습니다')
      router.push(`/room/${body.code}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '연결에 실패했습니다')
      setBusy(false)
    }
  }

  function enterByCode(): void {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 6) {
      setError('방 코드는 6자리입니다')
      return
    }
    saveNickname(nickname)
    router.push(`/room/${trimmed}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-hi)' }}>
          retro-party
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-lo)' }}>
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
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          가입은 없다. 판이 끝난 뒤에 기록을 남길지 물어본다.
        </p>
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => void quickJoin()}
          disabled={busy || nickname.trim().length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold disabled:opacity-50"
          style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
          바로 참가
          {!busy && <ArrowRight size={18} aria-hidden />}
        </button>

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
            onClick={enterByCode}
            className="shrink-0 rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-hi)' }}
          >
            코드로 입장
          </button>
        </div>

        {error !== null && (
          <p className="text-sm" style={{ color: 'var(--red)' }} role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
