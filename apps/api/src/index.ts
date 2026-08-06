import { parseRoomCode, ROOM_CAPACITY, type RoomCode } from '@retro/types'
import { listGames } from './registry.ts'
import { buildEmbed, parseReport, sendToDiscord } from './report.ts'

export { RoomDO } from './room-do.ts'
export { LobbyDO } from './lobby-do.ts'

/**
 * API Worker — 05 문서 §2
 *
 * 방 로직은 RoomDO, 목록은 LobbyDO 안에 있다.
 * 여기서 하는 일은 코드로 DO 를 찾아 넘기는 것뿐이다. 실시간 경로에 DB 는 없다.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** 헷갈리는 글자(I·O·0·1)를 뺀 6자리 — 03 문서 §6.3 */
function newRoomCode(): RoomCode {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out as RoomCode
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: cors })

const lobbyOf = (env: Env): DurableObjectStub =>
  env.LOBBY.get(env.LOBBY.idFromName('global'), { locationHint: 'apac' })

const roomOf = (env: Env, code: RoomCode): DurableObjectStub =>
  env.ROOM.get(env.ROOM.idFromName(code), { locationHint: 'apac' })

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    // 고를 수 있는 게임 목록
    if (url.pathname === '/api/games') return json({ games: listGames() })

    /**
     * 문항 신고. 기계 검증은 형식만 잡고, 사실이 틀렸는지는 플레이하는 사람이 안다.
     * 웹훅 주소는 서버 환경변수에만 있다 — 클라이언트로 내보내지 않는다
     */
    if (url.pathname === '/api/report' && request.method === 'POST') {
      const report = parseReport(await request.json().catch(() => null))
      if (report === null) return json({ error: '신고 내용이 올바르지 않습니다' }, 400)

      const quota = await lobbyOf(env).fetch('https://lobby/report-quota', { method: 'POST' })
      const allowed = ((await quota.json()) as { allowed?: boolean }).allowed === true
      if (!allowed) return json({ error: '신고가 너무 잦습니다. 잠시 후 다시 시도해 주세요' }, 429)

      const webhook = env.DISCORD_WEBHOOK_URL
      if (webhook === undefined || webhook.length === 0) {
        return json({ error: '신고 채널이 설정되지 않았습니다' }, 503)
      }

      const sent = await sendToDiscord(webhook, buildEmbed(report, new Date().toISOString()))
      return sent ? json({ ok: true }) : json({ error: '신고를 보내지 못했습니다' }, 502)
    }

    // 방 목록 — 사람 수 내림차순, 빈 방은 안 나온다 (03 문서 §4.2)
    if (url.pathname === '/api/rooms' && request.method === 'GET') {
      const response = await lobbyOf(env).fetch('https://lobby/list')
      return json(await response.json())
    }

    // [바로 참가] — 가장 사람 많고 자리가 남은 공개 방. 없으면 null
    if (url.pathname === '/api/rooms/quick' && request.method === 'POST') {
      const response = await lobbyOf(env).fetch('https://lobby/quick')
      return json(await response.json())
    }

    // 방 만들기
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const code = newRoomCode()
      const body = await request.text()
      const created = await roomOf(env, code).fetch(
        `https://room/create?code=${code}`,
        { method: 'POST', body },
      )
      if (!created.ok) return json({ error: '방을 만들지 못했습니다' }, 500)
      const detail = (await created.json()) as Record<string, unknown>
      return json({ ...detail, code, capacity: ROOM_CAPACITY })
    }

    // /api/rooms/:code/(ws|state|ticket)
    const match = /^\/api\/rooms\/([^/]+)\/(ws|state|ticket)$/.exec(url.pathname)
    if (match !== null) {
      const code = parseRoomCode((match[1] ?? '').toUpperCase())
      const tail = match[2] ?? ''
      if (code === null) return json({ error: '방 코드 형식이 아닙니다' }, 400)

      const forward = new URL(request.url)
      forward.searchParams.set('code', code)
      forward.pathname = `/${tail}`
      return roomOf(env, code).fetch(new Request(forward, request))
    }

    return json({ error: 'not found' }, 404)
  },
} satisfies ExportedHandler<Env>
