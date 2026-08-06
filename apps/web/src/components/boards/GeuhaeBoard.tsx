export interface GeuhaeView {
  readonly hints: readonly string[]
  readonly totalHints: number
  readonly nextHintInMs: number | null
  readonly solvedCount: number
  readonly youSolved: boolean
  readonly usedNear: boolean
}

export const isGeuhaeView = (v: unknown): v is GeuhaeView =>
  typeof v === 'object' && v !== null && 'hints' in v && 'totalHints' in v

/**
 * 힌트는 어려운 것부터 열린다. 일찍 맞힐수록 점수가 높다 — 02 문서 §1.1
 * 아직 안 열린 자리를 점으로 보여줘야 "곧 하나 더 열린다"가 전달된다.
 */
export function GeuhaeBoard({ view }: { view: GeuhaeView }) {
  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        몇 년도일까요
      </p>

      <ol className="mt-3 w-full space-y-1.5 text-left">
        {view.hints.map((hint, i) => (
          <li key={hint} className="flex gap-2.5 text-sm" style={{ color: 'var(--text)' }}>
            <span className="tnum shrink-0 font-semibold" style={{ color: 'var(--text-dim)' }}>
              {i + 1}
            </span>
            {hint}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="flex gap-1" aria-label={`힌트 ${view.hints.length}/${view.totalHints}`}>
          {Array.from({ length: view.totalHints }, (_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: i < view.hints.length ? 'var(--lime)' : 'var(--border)',
              }}
            />
          ))}
        </span>
        {view.nextHintInMs !== null && (
          <span className="tnum text-xs" style={{ color: 'var(--text-dim)' }}>
            다음 힌트 {Math.ceil(view.nextHintInMs / 1000)}초
          </span>
        )}
      </div>

      {view.usedNear && (
        <p className="mt-2 text-xs" style={{ color: 'var(--amber)' }}>
          한 해 차이로 아까웠습니다. 부분 점수는 한 번뿐이에요
        </p>
      )}
    </>
  )
}
