import { TOPIC_IDS, type TopicId } from '@retro/types'

/**
 * 문항 신고 → Discord 웹훅.
 *
 * 「그 해」와 「그때 그 가격」은 사실을 다루므로 틀린 문항이 반드시 나온다.
 * 기계 검증(tools/content.ts)이 잡는 건 형식뿐이고, **사실이 맞는지는
 * 플레이하는 사람이 제일 먼저 안다.** 그래서 그 자리에서 신고할 수 있어야 한다.
 *
 * 웹훅 URL 은 **서버에만 둔다.** 클라이언트 번들에 넣으면 누구나 그 주소로
 * 아무 메시지나 쏠 수 있다 — 공개해도 되는 주소여도 스팸 통로가 되는 건 다른 문제다.
 */

export const REPORT_REASONS = ['wrong-fact', 'wrong-answer', 'bad-hint', 'offensive', 'etc'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

const REASON_LABEL: Readonly<Record<ReportReason, string>> = {
  'wrong-fact': '사실이 틀렸어요',
  'wrong-answer': '정답이 이상해요',
  'bad-hint': '힌트가 이상해요',
  offensive: '부적절한 내용이에요',
  etc: '기타',
}

export const MAX_DETAIL = 300

export interface BugReport {
  readonly gameId: string
  readonly reason: ReportReason
  /** 신고 대상 문항을 알아볼 수 있는 최소 정보. 정답은 담지 않는다 */
  readonly subject: string
  readonly detail: string
  readonly topic: TopicId | null
  readonly roomCode: string | null
}

const isReason = (v: unknown): v is ReportReason =>
  typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v)

/** 신뢰할 수 없는 입력. 반드시 파서를 통과시킨다 */
export function parseReport(raw: unknown): BugReport | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const gameId = r['gameId']
  const reason = r['reason']
  const subject = r['subject']
  const detail = r['detail']
  const topic = r['topic']
  const roomCode = r['roomCode']

  if (typeof gameId !== 'string' || gameId.length === 0 || gameId.length > 32) return null
  if (!isReason(reason)) return null
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > 120) return null

  const text = typeof detail === 'string' ? detail.trim().slice(0, MAX_DETAIL) : ''

  return {
    gameId,
    reason,
    subject: subject.trim(),
    detail: text,
    topic: typeof topic === 'string' && (TOPIC_IDS as readonly string[]).includes(topic)
      ? (topic as TopicId)
      : null,
    roomCode: typeof roomCode === 'string' && /^[A-Z0-9]{6}$/.test(roomCode) ? roomCode : null,
  }
}

/** 사실 오류는 빨강, 나머지는 앰버 — 06 문서의 시맨틱 컬러와 맞춘다 */
const COLORS: Readonly<Record<ReportReason, number>> = {
  'wrong-fact': 0xbe1c1c,
  'wrong-answer': 0xbe1c1c,
  'bad-hint': 0x9a4c07,
  offensive: 0x6d28d9,
  etc: 0x586070,
}

export interface DiscordEmbedPayload {
  readonly embeds: readonly unknown[]
}

export function buildEmbed(report: BugReport, receivedAtIso: string): DiscordEmbedPayload {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: '게임', value: report.gameId, inline: true },
    { name: '사유', value: REASON_LABEL[report.reason], inline: true },
  ]
  if (report.topic !== null) fields.push({ name: '주제', value: report.topic, inline: true })
  fields.push({ name: '문항', value: report.subject.slice(0, 1000) })
  if (report.detail.length > 0) {
    fields.push({ name: '남긴 말', value: report.detail.slice(0, 1000) })
  }
  if (report.roomCode !== null) fields.push({ name: '방', value: report.roomCode, inline: true })

  return {
    embeds: [
      {
        title: '문항 신고',
        color: COLORS[report.reason],
        fields,
        footer: { text: '손이심심' },
        timestamp: receivedAtIso,
      },
    ],
  }
}

export async function sendToDiscord(
  webhookUrl: string,
  payload: DiscordEmbedPayload,
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch {
    // 신고가 실패해도 게임은 계속 돌아야 한다
    return false
  }
}
