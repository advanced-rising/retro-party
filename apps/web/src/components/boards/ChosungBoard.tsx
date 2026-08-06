import { Lightbulb } from 'lucide-react'

export interface ChosungView {
  readonly chosung: string
  readonly length: number
  readonly category: string
  readonly hint: string | null
  readonly firstVowel: string | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

export const isChosungView = (v: unknown): v is ChosungView =>
  typeof v === 'object' && v !== null && 'chosung' in v

export function ChosungBoard({ view }: { view: ChosungView }) {
  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.category} · {view.length}글자
      </p>

      <p
        className="mt-3 text-5xl font-bold tracking-[0.25em] sm:text-6xl"
        style={{ color: 'var(--text-hi)' }}
        aria-label={`초성 ${[...view.chosung].join(' ')}`}
      >
        {view.chosung}
      </p>

      <div className="mt-4 flex min-h-10 flex-col items-center gap-1">
        {view.hint !== null && (
          <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-lo)' }}>
            <Lightbulb size={14} aria-hidden />
            {view.hint}
          </p>
        )}
        {view.firstVowel !== null && (
          <p className="text-sm" style={{ color: 'var(--text-lo)' }}>
            첫 글자 모음 <strong style={{ color: 'var(--text-hi)' }}>{view.firstVowel}</strong>
          </p>
        )}
      </div>
    </>
  )
}
