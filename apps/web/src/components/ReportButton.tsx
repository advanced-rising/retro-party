'use client'

import { useState } from 'react'
import { Flag, Check as CheckIcon } from 'lucide-react'
import { sendReport, type ReportReason } from '@/lib/api'

/**
 * 문항 신고 — 08 문서 §2
 *
 * 「그 해」·「그때 그 가격」은 사실을 다루므로 틀린 문항이 반드시 나온다.
 * 기계 검증(pnpm content)은 형식만 잡고, **사실이 맞는지는 지금 보고 있는
 * 사람이 제일 먼저 안다.** 정답 공개 화면에서 바로 누를 수 있어야 한다.
 */

const REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'wrong-fact', label: '사실이 틀렸어요' },
  { value: 'wrong-answer', label: '정답이 이상해요' },
  { value: 'bad-hint', label: '힌트가 이상해요' },
  { value: 'offensive', label: '부적절해요' },
]

export function ReportButton({
  gameId,
  subject,
  roomCode,
}: {
  gameId: string
  subject: string
  roomCode: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('wrong-fact')
  const [detail, setDetail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(): Promise<void> {
    setState('sending')
    try {
      await sendReport({ gameId, reason, subject, detail, roomCode })
      setState('done')
      setTimeout(() => {
        setOpen(false)
        setState('idle')
        setDetail('')
      }, 1_400)
    } catch (cause) {
      setState('error')
      setMessage(cause instanceof Error ? cause.message : '보내지 못했습니다')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1 text-xs"
        style={{ color: 'var(--text-dim)' }}
      >
        <Flag size={11} aria-hidden />
        이 문제 신고
      </button>
    )
  }

  if (state === 'done') {
    return (
      <p
        className="mt-3 flex items-center gap-1.5 text-xs"
        style={{ color: 'var(--lime)' }}
        role="status"
      >
        <CheckIcon size={12} aria-hidden />
        보냈습니다. 확인하고 고칠게요
      </p>
    )
  }

  return (
    <div className="mt-3 w-full space-y-2 border-t pt-3 text-left">
      <div className="flex flex-wrap gap-1">
        {REASONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setReason(option.value)}
            className="rounded-full border px-2.5 py-1 text-xs"
            style={{
              background: reason === option.value ? 'var(--lime-wash)' : 'var(--bg-elevated)',
              borderColor: reason === option.value ? 'var(--lime)' : 'var(--border)',
              color: reason === option.value ? 'var(--lime)' : 'var(--text-lo)',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        maxLength={300}
        placeholder="무엇이 잘못됐는지 알려주세요 (선택)"
        className="w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        style={{ background: 'var(--bg-base)', color: 'var(--text-hi)' }}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === 'sending'}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
        >
          보내기
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs"
          style={{ color: 'var(--text-dim)' }}
        >
          취소
        </button>
      </div>

      {state === 'error' && (
        <p className="text-xs" style={{ color: 'var(--red)' }} role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
