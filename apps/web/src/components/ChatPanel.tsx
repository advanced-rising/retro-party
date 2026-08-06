'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { m } from 'motion/react'
import { SendHorizontal } from 'lucide-react'
import { EMOTES, MAX_CHAT_LENGTH, type ChatChannel, type ChatLine, type Participant, type PlayerId } from '@retro/types'

/**
 * 채팅 — 01 문서 §6
 *
 * 이 입력창이 곧 정답 입력이다. 그래서 두 가지가 절대 깨지면 안 된다.
 *   1. 어떤 상황에서도 포커스를 잃지 않는다
 *   2. 모바일 키보드가 올라와도 가려지지 않는다 (06 문서 §8)
 *
 * 받은 줄은 화면 메모리에만 있다. 새로고침하면 사라지는 게 정상이다.
 */
export function ChatPanel({
  lines,
  participants,
  you,
  teamMode,
  disabled,
  onSend,
}: {
  lines: readonly ChatLine[]
  participants: readonly Participant[]
  you: PlayerId | null
  teamMode: boolean
  disabled: boolean
  onSend: (text: string, channel: ChatChannel) => void
}) {
  const [text, setText] = useState('')
  const [channel, setChannel] = useState<ChatChannel>('all')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 팀전에서는 팀 채널이 기본이다. 전체 채널에 답을 치면 점수가 안 들어간다
  useEffect(() => {
    setChannel(teamMode ? 'team' : 'all')
  }, [teamMode])

  useEffect(() => {
    const list = listRef.current
    if (list !== null) list.scrollTop = list.scrollHeight
  }, [lines])

  const nameOf = (id: PlayerId): string =>
    participants.find((p) => p.playerId === id)?.nickname ?? '알 수 없음'

  const teamOf = (id: PlayerId) => participants.find((p) => p.playerId === id)?.team ?? null

  function submit(event: FormEvent): void {
    event.preventDefault()
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    onSend(trimmed, channel)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1 py-2"
        aria-live="polite"
        aria-label="채팅"
      >
        {lines.length === 0 && (
          <p className="px-2 py-4 text-sm" style={{ color: 'var(--text-dim)' }}>
            여기에 답을 쳐서 맞힙니다
          </p>
        )}
        {lines.map((line, i) => (
          <Line
            key={`${line.from}-${i}`}
            line={line}
            name={nameOf(line.from)}
            team={teamOf(line.from)}
            mine={line.from === you}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 px-1 pb-2">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            type="button"
            disabled={disabled}
            onClick={() => onSend(emote, channel)}
            className="rounded-full border px-2.5 py-1 text-xs disabled:opacity-40"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-lo)' }}
          >
            {emote}
          </button>
        ))}
      </div>

      {/* items-stretch — 버튼이 입력창과 같은 높이가 되게 한다 */}
      <form onSubmit={submit} className="flex items-stretch gap-2 px-1 pb-1">
        {teamMode && (
          <button
            type="button"
            onClick={() => setChannel((c) => (c === 'team' ? 'all' : 'team'))}
            className="flex shrink-0 items-center rounded-lg border px-2.5 text-xs font-semibold"
            style={{
              background: channel === 'team' ? 'var(--lime-wash)' : 'var(--bg-elevated)',
              color: channel === 'team' ? 'var(--lime)' : 'var(--text-lo)',
            }}
            aria-label={channel === 'team' ? '팀 채널. 눌러서 전체로' : '전체 채널. 눌러서 팀으로'}
          >
            {channel === 'team' ? '팀' : '전체'}
          </button>
        )}

        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHAT_LENGTH}
          disabled={disabled}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={teamMode && channel === 'all' ? '전체 채널 — 점수가 안 들어갑니다' : '답을 입력하세요'}
          className="min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-base outline-none disabled:opacity-50"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-hi)' }}
        />

        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="flex aspect-square shrink-0 items-center justify-center rounded-lg font-semibold disabled:opacity-40"
          style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
          aria-label="보내기"
        >
          <SendHorizontal size={16} aria-hidden />
        </button>
      </form>
    </div>
  )
}

function Line({
  line,
  name,
  team,
  mine,
}: {
  line: ChatLine
  name: string
  team: 0 | 1 | null
  mine: boolean
}) {
  const correct = line.correct !== null
  const nameColor =
    team === 0 ? 'var(--blue)' : team === 1 ? 'var(--red)' : mine ? 'var(--text-hi)' : 'var(--text-lo)'

  return (
    <m.p
      className="rounded-md px-2 py-1 text-sm leading-relaxed"
      style={{
        background: correct ? 'var(--lime-wash)' : 'transparent',
        color: correct ? 'var(--lime)' : 'var(--text)',
      }}
      initial={correct ? { opacity: 0, scale: 0.9 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        correct
          ? { type: 'spring', stiffness: 420, damping: 22 }
          : { duration: 0.18, ease: 'easeOut' }
      }
      aria-live={correct ? 'assertive' : 'off'}
    >
      {line.channel === 'team' && (
        <span className="mr-1 text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>
          [팀]
        </span>
      )}
      <span className="mr-1.5 font-semibold" style={{ color: correct ? 'var(--lime)' : nameColor }}>
        {name}
      </span>
      {line.text}
      {line.correct !== null && (
        <span className="tnum ml-1.5 font-bold">+{line.correct.points}</span>
      )}
      {/* 「그때 그 가격」의 "더 비싸요" 같은 판정 한 줄. 본인에게만 의미가 있다 */}
      {line.note !== null && (
        <span className="ml-1.5 text-xs font-semibold" style={{ color: 'var(--amber)' }}>
          {line.note}
        </span>
      )}
    </m.p>
  )
}
