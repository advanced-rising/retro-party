/**
 * 방 비밀번호 — 08 문서
 *
 * 세 가지를 지킨다.
 *   1. 원문을 저장하지 않는다 (PBKDF2 해시만)
 *   2. 원문을 URL 에 싣지 않는다 (WebSocket 은 헤더를 못 붙이므로 티켓으로 교환한다)
 *   3. 원문도 해시도 클라이언트로 나가지 않는다 (방 상태에는 locked 불리언만)
 *
 * 친구끼리 쓰는 방 비밀번호라 위협 모델은 낮지만, 원문 저장은 어떤 경우에도 안 한다.
 */

const ITERATIONS = 100_000
const KEY_BITS = 256
const SALT_BYTES = 16

export interface PasswordHash {
  readonly salt: string
  readonly hash: string
  readonly iterations: number
}

const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return {
    salt: toHex(salt.buffer as ArrayBuffer),
    hash: await derive(password, salt, ITERATIONS),
    iterations: ITERATIONS,
  }
}

/** 길이가 같은 두 문자열을 상수 시간으로 비교한다 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPassword(stored: PasswordHash, attempt: string): Promise<boolean> {
  const derived = await derive(attempt, fromHex(stored.salt), stored.iterations)
  return timingSafeEqual(derived, stored.hash)
}

/** 비밀번호 규칙. 공백만 있는 값은 잠금이 아니다 */
export const MAX_PASSWORD_LENGTH = 20

export function normalizePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PASSWORD_LENGTH) return null
  return trimmed
}

// ── 티켓 ─────────────────────────────────────────────

/**
 * 브라우저 WebSocket 은 커스텀 헤더를 못 붙인다. 그래서 비밀번호를
 * 쿼리스트링에 실으면 로그·리퍼러·히스토리에 남는다.
 *
 * 대신 POST 로 검증하고 짧게 사는 티켓을 받아, 그 티켓으로 소켓을 연다.
 */
export const TICKET_TTL_MS = 60_000

export function newTicket(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer)
}

export function pruneTickets(
  tickets: ReadonlyMap<string, number>,
  nowMs: number,
): Map<string, number> {
  return new Map([...tickets].filter(([, expiresAtMs]) => expiresAtMs > nowMs))
}
