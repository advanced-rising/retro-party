import { Ban, MicVocal } from 'lucide-react'

export interface AssocPresenterView {
  readonly role: 'presenter'
  readonly word: string
  readonly category: string
  readonly banned: readonly string[]
  readonly solvedCount: number
}

export interface AssocGuesserView {
  readonly role: 'guesser'
  readonly category: string
  readonly length: number
  readonly presenter: string | null
  readonly script: readonly string[]
  readonly solvedCount: number
  readonly youSolved: boolean
}

export type AssocView = AssocPresenterView | AssocGuesserView

export const isAssocView = (v: unknown): v is AssocView =>
  typeof v === 'object' &&
  v !== null &&
  ((v as { role?: unknown }).role === 'presenter' || (v as { role?: unknown }).role === 'guesser')

export function AssocBoard({ view, presenterName }: { view: AssocView; presenterName: string }) {
  if (view.role === 'presenter') return <PresenterBoard view={view} />
  return <GuesserBoard view={view} presenterName={presenterName} />
}

/** 출제자만 정답을 본다. 금칙어를 함께 보여주지 않으면 답답해서 못 한다 — 02 문서 §3.4 */
function PresenterBoard({ view }: { view: AssocPresenterView }) {
  return (
    <>
      <p
        className="flex items-center justify-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--purple)' }}
      >
        <MicVocal size={13} aria-hidden />
        당신이 출제자입니다
      </p>

      <p className="mt-3 text-4xl font-bold tracking-[0.15em]" style={{ color: 'var(--text-hi)' }}>
        {view.word}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
        {view.category}
      </p>

      <p
        className="mt-4 flex flex-wrap items-center justify-center gap-1 text-xs"
        style={{ color: 'var(--text-lo)' }}
      >
        <Ban size={12} className="shrink-0" color="var(--red)" aria-hidden />
        <span className="mr-1">쓸 수 없는 말</span>
        {view.banned.slice(0, 8).map((word) => (
          <code
            key={word}
            className="rounded px-1.5 py-0.5"
            style={{ background: 'var(--bg-elevated)', color: 'var(--red)' }}
          >
            {word}
          </code>
        ))}
        {view.banned.length > 8 && <span>외 {view.banned.length - 8}개</span>}
      </p>
    </>
  )
}

/** 맞히는 사람은 카테고리와 글자 수만 본다 — 02 문서 §3.3 */
function GuesserBoard({
  view,
  presenterName,
}: {
  view: AssocGuesserView
  presenterName: string
}) {
  return (
    <>
      <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-dim)' }}>
        {view.presenter === null ? '설명을 읽고 맞혀 보세요' : `${presenterName} 님이 출제 중`}
      </p>

      <p
        className="mt-3 text-4xl font-bold tracking-[0.3em]"
        style={{ color: 'var(--text-lo)' }}
        aria-label={`${view.length}글자`}
      >
        {'?'.repeat(view.length)}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>
        {view.category} · {view.length}글자
      </p>

      {/* 혼자 모드에서만 채워진다. 가짜 출제자를 참가자 목록에 세우지 않는다 — 03 문서 §7.3 */}
      {view.script.length > 0 && (
        <ol className="mt-4 w-full space-y-1.5 text-left">
          {view.script.map((line, i) => (
            <li key={line} className="flex gap-2.5 text-sm" style={{ color: 'var(--text)' }}>
              <span className="tnum shrink-0 font-semibold" style={{ color: 'var(--text-dim)' }}>
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
