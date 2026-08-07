import { parseRoomCode, ROOM_CAPACITY, type RoomCode } from '@retro/types'
import { readProgress, recordReport } from '@retro/db'
import { connect } from './db.ts'
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

/**
 * DO 는 **RPC 로 부른다.**
 *
 * 예전에는 `stub.fetch('https://lobby/list')` 였다. 경로를 오타 내도
 * 컴파일이 통과하고, 인자와 반환을 매번 JSON 으로 싸고 풀어야 했다.
 * 스텁에 타입 인자를 주면 메서드가 그대로 보이고 반환 타입이 살아 있다.
 */
const lobbyOf = (env: Env) =>
  env.LOBBY.get(env.LOBBY.idFromName('global'), { locationHint: 'apac' })

const roomOf = (env: Env, code: RoomCode) =>
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

      if (!(await lobbyOf(env).takeReportQuota())) {
        return json({ error: '신고가 너무 잦습니다. 잠시 후 다시 시도해 주세요' }, 429)
      }

      const webhook = env.DISCORD_WEBHOOK_URL
      if (webhook === undefined || webhook.length === 0) {
        return json({ error: '신고 채널이 설정되지 않았습니다' }, 503)
      }

      const sent = await sendToDiscord(webhook, buildEmbed(report, new Date().toISOString()))
      // Discord 는 알림이고 DB 는 목록이다. 둘 다 남긴다
      await recordReport(connect(env), report)
      return sent ? json({ ok: true }) : json({ error: '신고를 보내지 못했습니다' }, 502)
    }

    // 방 목록 — 사람 수 내림차순, 빈 방은 안 나온다 (03 문서 §4.2)
    if (url.pathname === '/api/rooms' && request.method === 'GET') {
      return json({ rooms: await lobbyOf(env).list() })
    }

    // [바로 참가] — 가장 사람 많고 자리가 남은 공개 방. 없으면 null
    if (url.pathname === '/api/rooms/quick' && request.method === 'POST') {
      return json({ code: await lobbyOf(env).quickJoin() })
    }

    // 내 진행 상황 — 레벨과 경험치. DB 가 없으면 1레벨로 떨어진다
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const deviceId = url.searchParams.get('deviceId') ?? ''
      return json({ progress: await readProgress(connect(env), deviceId) })
    }

    // 방 만들기
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const code = newRoomCode()
      const body: unknown = await request.json().catch(() => ({}))
      const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
        string,
        unknown
      >

      const created = await roomOf(env, code).create(code, input)
      if (!created.ok) return json({ error: created.error }, 409)
      return json({ ...created, capacity: ROOM_CAPACITY })
    }

    // /api/rooms/:code/(ws|state|ticket)
    const match = /^\/api\/rooms\/([^/]+)\/(ws|state|ticket)$/.exec(url.pathname)
    if (match !== null) {
      const code = parseRoomCode((match[1] ?? '').toUpperCase())
      const tail = match[2] ?? ''
      if (code === null) return json({ error: '방 코드 형식이 아닙니다' }, 400)
      const room = roomOf(env, code)

      if (tail === 'state') return json(await room.state(code))

      if (tail === 'ticket') {
        const body: unknown = await request.json().catch(() => null)
        const password =
          typeof body === 'object' && body !== null
            ? (body as Record<string, unknown>)['password']
            : null
        const ticket = await room.issueTicket(code, password)
        return ticket === null
          ? json({ error: '비밀번호가 다릅니다' }, 403)
          : json({ ticket })
      }

      // WebSocket 업그레이드만 fetch 로 넘긴다 — 연결은 RPC 로 못 옮긴다
      const forward = new URL(request.url)
      forward.searchParams.set('code', code)
      forward.pathname = '/ws'
      return room.fetch(new Request(forward, request))
    }

    return json({ error: 'not found' }, 404)
  },
} satisfies ExportedHandler<Env>
