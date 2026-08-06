import { listableRooms, pickQuickJoin, ROOM_STALE_MS, type RoomSummary } from '@retro/types'

/**
 * LobbyDO — 방 목록 집계. 05 문서 §3
 *
 * 각 RoomDO 가 상태가 바뀔 때마다 자기 요약을 여기로 보낸다.
 * 목록 정렬 규칙(사람 수 내림차순 · 빈 방 미노출)은 @retro/types 의 순수 함수라
 * 노드에서 테스트된다 — 03 문서 §4.2 의 뭉치기 압력이 여기 걸려 있다.
 *
 * 이 DO 는 방 하나가 아니라 전체를 본다. 인스턴스는 하나다.
 */

const STORAGE_KEY = 'rooms'

export class LobbyDO implements DurableObject {
  private rooms = new Map<string, RoomSummary>()
  private loaded = false

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    const saved = await this.ctx.storage.get<readonly RoomSummary[]>(STORAGE_KEY)
    for (const room of saved ?? []) this.rooms.set(room.code, room)
    this.loaded = true
  }

  /** 죽은 방을 걷어낸다. 방이 알림 없이 사라지는 경우가 항상 있다 */
  private sweep(nowMs: number): void {
    for (const [code, room] of this.rooms) {
      if (nowMs - room.updatedAtMs >= ROOM_STALE_MS) this.rooms.delete(code)
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, [...this.rooms.values()])
  }

  async fetch(request: Request): Promise<Response> {
    await this.load()
    const url = new URL(request.url)
    const nowMs = Date.now()
    this.sweep(nowMs)

    // RoomDO 가 자기 상태를 알려온다
    if (url.pathname === '/report' && request.method === 'POST') {
      const body: unknown = await request.json()
      const summary = parseSummary(body, nowMs)
      if (summary === null) return new Response('bad report', { status: 400 })

      // 사람이 없는 방은 목록에서 지운다. 살아 있어도 띄우지 않는다
      if (summary.players === 0) this.rooms.delete(summary.code)
      else this.rooms.set(summary.code, summary)

      await this.persist()
      return Response.json({ ok: true })
    }

    if (url.pathname === '/list') {
      return Response.json({ rooms: listableRooms([...this.rooms.values()], nowMs) })
    }

    if (url.pathname === '/quick') {
      const target = pickQuickJoin([...this.rooms.values()], nowMs)
      return Response.json({ code: target?.code ?? null })
    }

    return new Response('not found', { status: 404 })
  }
}

/** 신뢰할 수 없는 입력. 반드시 파서를 통과시킨다 */
function parseSummary(raw: unknown, nowMs: number): RoomSummary | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const code = r['code']
  const title = r['title']
  const gameId = r['gameId']
  const mode = r['mode']
  const players = r['players']
  const capacity = r['capacity']
  const phase = r['phase']
  const locked = r['locked']

  if (typeof code !== 'string' || code.length === 0) return null
  if (typeof title !== 'string') return null
  if (typeof gameId !== 'string') return null
  if (typeof players !== 'number' || typeof capacity !== 'number') return null
  if (typeof phase !== 'string') return null
  if (typeof locked !== 'boolean') return null
  if (mode !== 'casual' && mode !== 'team' && mode !== 'rank' && mode !== 'solo') return null

  return {
    code,
    title,
    gameId,
    mode,
    players,
    capacity,
    phase,
    locked,
    updatedAtMs: nowMs,
  } as RoomSummary
}
