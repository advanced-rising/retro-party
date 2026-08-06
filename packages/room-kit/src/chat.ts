import type { ChatChannel, PlayerId, RoomMode, TeamId } from '@retro/types'

/**
 * 채팅 — 01 문서 §6 · 08 문서 §11
 *
 * 저장하지 않는다. 이 파일 어디에도 영속화 코드가 없어야 한다.
 * 서버는 받아서 즉시 던지고 잊는다.
 */

/** 초당 1건. 연속 3건 후 3초 쿨다운 */
const MIN_INTERVAL_MS = 1_000
const BURST_LIMIT = 3
const COOLDOWN_MS = 3_000

interface RateEntry {
  lastAtMs: number
  burst: number
  cooldownUntilMs: number
}

export interface RateLimiter {
  allow(playerId: PlayerId, nowMs: number): boolean
  forget(playerId: PlayerId): void
}

export function createRateLimiter(): RateLimiter {
  const entries = new Map<PlayerId, RateEntry>()

  return {
    allow(playerId, nowMs) {
      const e = entries.get(playerId)
      if (e === undefined) {
        entries.set(playerId, { lastAtMs: nowMs, burst: 1, cooldownUntilMs: 0 })
        return true
      }
      if (nowMs < e.cooldownUntilMs) return false

      const gap = nowMs - e.lastAtMs
      if (gap < MIN_INTERVAL_MS) {
        e.burst += 1
        if (e.burst > BURST_LIMIT) {
          e.cooldownUntilMs = nowMs + COOLDOWN_MS
          e.burst = 0
          return false
        }
      } else {
        e.burst = 1
      }
      e.lastAtMs = nowMs
      return true
    },
    forget(playerId) {
      entries.delete(playerId)
    },
  }
}

/**
 * 팀전에서 정답 판정은 팀 채널에서만 한다 — 01 문서 §6.5.2
 * 전체 채널에 답을 쳐도 점수가 들어가면 안 된다.
 */
export function isJudgeable(mode: RoomMode, channel: ChatChannel): boolean {
  return mode !== 'team' || channel === 'team'
}

/**
 * 이 메시지를 받아야 하는 참가자인가.
 * 팀 채널은 같은 팀에게만 간다 — 새면 팀전이 통째로 무너진다.
 */
export function canReceive(
  channel: ChatChannel,
  senderTeam: TeamId | null,
  receiverTeam: TeamId | null,
): boolean {
  if (channel === 'all') return true
  if (senderTeam === null) return true // 팀전이 아니면 팀 채널도 전체와 같다
  return senderTeam === receiverTeam
}

/** 개인정보 유도 차단 — URL · 전화번호 · 계좌번호 패턴 마스킹 */
const MASK_PATTERNS: readonly RegExp[] = [
  /https?:\/\/\S+/gi,
  /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
  /\b\d{10,16}\b/g,
]

export interface SanitizeResult {
  readonly text: string | null
  readonly blocked: boolean
}

/**
 * 금칙어 필터와 마스킹. **원문을 저장하지 않는다** — 통과 여부만 판정한다.
 * blockedWords 는 단어 연상의 자동 생성 금칙어(02 문서 §3.4)에도 쓰인다.
 */
export function sanitize(text: string, blockedWords: readonly string[] = []): SanitizeResult {
  const lowered = text.toLowerCase()
  for (const word of blockedWords) {
    if (word.length > 0 && lowered.includes(word.toLowerCase())) {
      return { text: null, blocked: true }
    }
  }
  let out = text
  for (const re of MASK_PATTERNS) {
    out = out.replace(re, '***')
  }
  const trimmed = out.trim()
  return trimmed.length === 0 ? { text: null, blocked: false } : { text: trimmed, blocked: false }
}
