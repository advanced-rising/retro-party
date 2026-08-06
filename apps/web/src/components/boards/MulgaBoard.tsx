import { Coins } from 'lucide-react'

export interface MulgaView {
  readonly item: string
  readonly year: number
  readonly unit: string
  readonly note: string
  readonly digits: number | null
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly usedNear: boolean
}

export const isMulgaView = (v: unknown): v is MulgaView =>
  typeof v === 'object' && v !== null && 'item' in v && 'year' in v && 'unit' in v

/**
 * 그때 그 가격 — 방향 힌트가 채팅으로 오기 때문에 화면은 문제만 크게 보여준다.
 * "더 비싸요 / 더 싸요" 는 각자의 채팅 줄에 붙는다 (ChatPanel).
 */
export function MulgaBoard({ view }: { view: MulgaView }) {
  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.note}
      </p>

      <p className="mt-3 text-3xl font-bold" style={{ color: 'var(--text-hi)' }}>
        <span className="tnum">{view.year}</span>년
      </p>
      <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-hi)' }}>
        {view.item}
      </p>

      <p
        className="mt-3 flex items-center justify-center gap-1.5 text-sm"
        style={{ color: 'var(--text-lo)' }}
      >
        <Coins size={14} aria-hidden />
        얼마였을까요?
      </p>

      <p className="mt-3 min-h-5 text-sm" style={{ color: 'var(--amber)' }}>
        {view.digits !== null && `${view.digits}자리 숫자예요`}
      </p>
    </>
  )
}
