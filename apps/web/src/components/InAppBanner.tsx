'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import { inAppLabel, planEscape, type EscapePlan } from '@/lib/inapp'

/**
 * 인앱 브라우저 안내 — 03 문서 §6.2
 *
 * 링크로 들어오는 게 주 경로라 대부분 카카오톡 인앱으로 열린다.
 * 여기서는 세 가지가 깨진다 — 신원 저장, 개장 푸시, 키보드 뷰포트.
 * 그래서 바깥 브라우저로 옮기게 한다.
 *
 * 다만 **막지는 않는다.** 인앱에서도 게임은 돌아간다. 문을 막으면 들어오다 만다.
 */
export function InAppBanner() {
  const [plan, setPlan] = useState<EscapePlan>({ kind: 'none' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setPlan(planEscape(navigator.userAgent, window.location.href))
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
