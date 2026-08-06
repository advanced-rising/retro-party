import { parseRoomCode, ROOM_CAPACITY, type RoomCode } from '@retro/types'
import { listGames } from './registry.ts'

export { RoomDO } from './room-do.ts'

/**
 * API Worker — 05 문서 §2
 *
 * 방 로직은 전부 RoomDO 안에 있다. 여기서 하는 일은 코드로 DO 를 찾아 넘기는 것뿐이다.
 * 실시간 경로에 DB 를 두지 않는다.
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    // GET /api/games
    if (url.pathname === '/api/games') return json({ games: listGames() })

    // POST /api/rooms — 방을 만든다. 실제 생성은 첫 입장 때 DO 안에서 일어난다
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const code = newRoomCode()
      return json({ code, capacity: ROOM_CAPACITY })
    }

    // /api/rooms/:code/(ws|state)
    const match = /^\/api\/rooms\/([^/]+)\/(ws|state)$/.exec(url.pathname)
    if (match !== null) {
      const raw = match[1] ?? ''
      const tail = match[2] ?? ''
      const code = parseRoomCode(raw.toUpperCase())
      if (code === null) return json({ error: '방 코드 형식이 아닙니다' }, 400)

      // 같은 코드는 항상 같은 DO 로 간다
      const id = env.ROOM.idFromName(code)
      const stub = env.ROOM.get(id, { locationHint: 'apac' })

      const forward = new URL(request.url)
      forward.searchParams.set('code', code)
      forward.pathname = `/${tail}`
      return stub.fetch(new Request(forward, request))
    }

    return json({ error: 'not found' }, 404)
  },
} satisfies ExportedHandler<Env>
