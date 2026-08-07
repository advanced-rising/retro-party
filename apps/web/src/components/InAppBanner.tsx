'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import {
  alreadyTriedEscape,
  inAppLabel,
  markEscapeTried,
  planEscape,
  type EscapePlan,
} from '@/lib/inapp'

/**
 * 인앱 브라우저 탈출 — 03 문서 §6.2
 *
 * 링크로 들어오는 게 주 경로라 대부분 카카오톡 인앱으로 열린다.
 * 여기서는 세 가지가 깨진다 — 신원 저장(localStorage 격리), 개장 푸시,
 * 키보드 뷰포트. 채팅이 정답 입력인 게임에서 마지막 하나는 치명적이다.
 *
 * ## 자동으로 넘긴다
 *
 * 예전에는 버튼을 눌러야 넘어갔다. 그런데 「브라우저로 열기」라는 버튼은
 * 누를 이유가 그 자리에서 안 보인다 — 지금 화면이 멀쩡해 보이기 때문이다.
 * 그래서 **들어오자마자 한 번 시도**하고, 실패하면 그때 버튼을 남긴다.
 *
 * 한 번만 시도한다. 스킴이 안 먹는 기기에서 계속 시도하면 페이지가 깜빡인다.
 */
export function InAppBanner() {
  const [plan, setPlan] = useState<EscapePlan>({ kind: 'none' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const next = planEscape(navigator.userAgent, window.location.href)
    setPlan(next)

    // 자동 탈출은 한 번만. 되면 이 페이지는 어차피 뒤에 남는다
    if (next.kind === 'auto' && !alreadyTriedEscape()) {
      markEscapeTried()
      window.location.href = next.url
    }
  }, [])

  if (plan.kind === 'none' || dismissed) return null

  return (
    <div
      className="mb-3 rounded-xl border px-3 py-2.5 text-sm"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--amber)' }}
      role="status"
    >
      <p className="flex items-start gap-2" style={{ color: 'var(--text-hi)' }}>
        <Info size={15} className="mt-0.5 shrink-0" color="var(--amber)" aria-hidden />
        <span>
          {inAppLabel(plan.app)} 안에서 열렸습니다. 기록이 저장되지 않고 키보드가 입력창을 가릴 수
          있어요.
        </span>
      </p>

      <div className="mt-2 flex items-center gap-2 pl-6">
        {plan.kind === 'auto' ? (
          <a
            href={plan.url}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: 'var(--lime)', color: 'var(--on-lime)' }}
          >
            브라우저로 열기
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-lo)' }}>
            {plan.hint}
          </span>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-auto text-xs"
          style={{ color: 'var(--text-dim)' }}
        >
          그냥 하기
        </button>
      </div>
    </div>
  )
}
