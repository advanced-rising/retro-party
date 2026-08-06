import {
  asPlayerId,
  asRoomId,
  asSeed,
  parseClientMessage,
  ROOM_CAPACITY,
  type Participant,
  type PlayerId,
  type RoomCode,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
  type TeamId,
} from '@retro/types'
import { createEngine, shouldDeliver, type Effect, type Engine } from '@retro/room-kit'
import { resolveGame, DEFAULT_GAME_ID, type AnyGame } from './registry.ts'

/**
 * RoomDO — 방 하나가 인스턴스 하나. 05 문서 §3
 *
 * 이 클래스가 하는 일은 세 가지뿐이다.
 *   1. WebSocket 을 받고 붙잡는다
 *   2. 들어온 메시지를 엔진에 넘긴다
 *   3. 엔진이 돌려준 Effect 를 소켓으로 내보낸다
 *
 * 게임 규칙도, 방 상태 전이도 여기 없다. 전부 @retro/room-kit 의 엔진이 한다.
 * 그래야 노드에서 테스트할 수 있다.
 */

interface Attachment {
  readonly playerId: string
  readonly nickname: string
}

/** 저장하는 것. 채팅은 절대 여기 들어가지 않는다 — 08 문서 §11 */
interface PersistedRoom {
  readonly code: string
  readonly seed: string
  readonly hostId: string
  readonly settings: RoomSettings
  readonly participants: readonly Participant[]
  readonly scores: readonly (readonly [string, number])[]
}

const STORAGE_KEY = 'room'

export class RoomDO implements DurableObject {
  private engine: Engine<unknown, unknown> | null = null
  private game: AnyGame = resolveGame(DEFAULT_GAME_ID)
  private booted = false

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  // ── 부팅 ───────────────────────────────────────────

  /** 하이버네이션에서 깨어났을 때 방 상태를 되살린다 */
  private async boot(code: string): Promise<Engine<unknown, unknown>> {
    if (this.engine !== null) return this.engine

    const saved = await this.ctx.storage.get<PersistedRoom>(STORAGE_KEY)
    const settings = saved?.settings ?? {
      gameId: DEFAULT_GAME_ID,
      mode: 'casual' as const,
      rounds: 5,
      teamSize: null,
      isPublic: true,
    }
    this.game = resolveGame(settings.gameId)

    // 깨어난 직후에는 아무도 붙어 있지 않다. 열린 소켓을 기준으로 참가자를 다시 세운다
    const live = new Set(
      this.ctx.getWebSockets().map((ws) => this.attachmentOf(ws)?.playerId ?? ''),
    )
    const participants = (saved?.participants ?? []).map((p) => ({
      ...p,
      connected: live.has(p.playerId),
    }))

    const room: RoomState = {
      roomId: asRoomId(this.ctx.id.toString()),
      code: (saved?.code ?? code) as RoomCode,
      seed: asSeed(saved?.seed ?? `${code}:${this.ctx.id.toString()}`),
      hostId: asPlayerId(saved?.hostId ?? ''),
      settings,
      // 라운드 중에는 매초 알람이 걸려 있어 하이버네이션되지 않는다.
      // 깨어났다는 건 로비였다는 뜻이므로 로비로 복원한다
      phase: { kind: 'lobby' },
      participants,
      scores: new Map(
        (saved?.scores ?? []).map(([id, v]) => [asPlayerId(id), v] as const),
      ),
    }

    this.engine = createEngine({
      game: this.game,
      room,
      pool: { version: 'inline', items: [] },
    })
    this.booted = true
    return this.engine
  }

  private async persist(): Promise<void> {
    const engine = this.engine
    if (engine === null) return
    const { room } = engine.state
    const data: PersistedRoom = {
      code: room.code,
      seed: room.seed,
      hostId: room.hostId,
      settings: room.settings,
      participants: room.participants,
      scores: [...room.scores].map(([id, v]) => [id as string, v] as const),
    }
    await this.ctx.storage.put(STORAGE_KEY, data)
  }

  // ── HTTP ───────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/state')) {
      const engine = await this.boot(url.searchParams.get('code') ?? '')
      const { room } = engine.state
      return Response.json({
        code: room.code,
        phase: room.phase.kind,
        players: room.participants.filter((p) => p.connected).length,
        capacity: ROOM_CAPACITY,
        gameId: room.settings.gameId,
      })
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const playerId = url.searchParams.get('playerId')
    const nickname = url.searchParams.get('nickname')
    const code = url.searchParams.get('code') ?? ''
    if (playerId === null || playerId.length === 0 || nickname === null) {
      return new Response('playerId · nickname 이 필요합니다', { status: 400 })
    }

    const engine = await this.boot(code)

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    const attachment: Attachment = { playerId, nickname }
    server.serializeAttachment(attachment)
    // 태그로 붙여두면 하이버네이션 후에도 소켓을 찾을 수 있다
    this.ctx.acceptWebSocket(server, [playerId])

    const participant: Participant = {
      playerId: asPlayerId(playerId),
      nickname: nickname.slice(0, 12),
      avatarIcon: pickAvatar(playerId),
      level: 1,
      titleName: null,
      team: null,
      connected: true,
      benched: false,
    }

    await this.dispatch(engine.join({ participant, nowMs: Date.now() }))

    return new Response(null, { status: 101, webSocket: client })
  }

  // ── WebSocket ──────────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> {
    if (typeof raw !== 'string') return
    const attachment = this.attachmentOf(ws)
    if (attachment === null) return

    const engine = this.engine
    if (engine === null || !this.booted) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return this.send(ws, { type: 'error', code: 'invalid_message', message: '형식이 잘못됐습니다' })
    }

    const message = parseClientMessage(parsed)
    if (message === null) {
      return this.send(ws, { type: 'error', code: 'invalid_message', message: '형식이 잘못됐습니다' })
    }

    const playerId = asPlayerId(attachment.playerId)
    const nowMs = Date.now()

    switch (message.type) {
      case 'chat':
        return this.dispatch(
          engine.chat({ playerId, text: message.text, channel: message.channel, nowMs }),
        )
      case 'emote':
        return this.dispatch(
          engine.chat({ playerId, text: message.emote, channel: 'all', nowMs }),
        )
      case 'start':
        return this.dispatch(engine.start(playerId, nowMs))
      case 'again':
        return this.dispatch(engine.again(playerId, nowMs))
      case 'settings':
        return this.dispatch(engine.settings(playerId, message.patch, nowMs))
      case 'kick':
        // Phase 0.5 미구현. 방장 권한 검증부터 필요하다
        return
      case 'ping':
        this.send(ws, { type: 'phase', phase: engine.state.room.phase })
        return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = this.attachmentOf(ws)
    if (attachment === null || this.engine === null) return
    await this.dispatch(this.engine.leave(asPlayerId(attachment.playerId), Date.now()))
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  async alarm(): Promise<void> {
    const engine = this.engine
    if (engine === null) return
    await this.dispatch(engine.tick(Date.now()))
  }

  // ── Effect 적용 ────────────────────────────────────

  private async dispatch(effects: readonly Effect[]): Promise<void> {
    let nextAlarmMs: number | null = null

    for (const effect of effects) {
      switch (effect.kind) {
        case 'broadcast':
          this.sendAll(effect.message)
          break

        case 'send':
          this.sendToPlayer(effect.to, effect.message)
          break

        case 'chat': {
          // ★ 팀 채널은 같은 팀에게만. 여기가 새면 팀전이 통째로 무너진다
          const message: ServerMessage = { type: 'chat', line: effect.line }
          for (const ws of this.ctx.getWebSockets()) {
            const attachment = this.attachmentOf(ws)
            if (attachment === null) continue
            const team = this.teamOf(asPlayerId(attachment.playerId))
            if (shouldDeliver(effect, team)) this.send(ws, message)
          }
          break
        }

        case 'alarm':
          nextAlarmMs = nextAlarmMs === null ? effect.atMs : Math.min(nextAlarmMs, effect.atMs)
          break

        case 'matchOver':
          // Phase 1 에서 경험치·전적을 여기에 붙인다 (10 문서)
          break
      }
    }

    if (nextAlarmMs !== null) await this.ctx.storage.setAlarm(nextAlarmMs)
    await this.persist()
  }

  private teamOf(playerId: PlayerId): TeamId | null {
    return (
      this.engine?.state.room.participants.find((p) => p.playerId === playerId)?.team ?? null
    )
  }

  private attachmentOf(ws: WebSocket): Attachment | null {
    const raw: unknown = ws.deserializeAttachment()
    if (typeof raw !== 'object' || raw === null) return null
    const record = raw as Record<string, unknown>
    const playerId = record['playerId']
    const nickname = record['nickname']
    if (typeof playerId !== 'string' || typeof nickname !== 'string') return null
    return { playerId, nickname }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // 이미 닫힌 소켓. close 핸들러가 정리한다
    }
  }

  private sendAll(message: ServerMessage): void {
    const payload = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload)
      } catch {
        /* 닫힌 소켓 */
      }
    }
  }

  private sendToPlayer(playerId: PlayerId, message: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets(playerId)) this.send(ws, message)
  }
}

const AVATARS = [
  'cassette-tape',
  'floppy-disk',
  'game-controller',
  'vinyl-record',
  'television-simple',
  'boombox',
  'rocket',
  'ghost',
] as const

function pickAvatar(playerId: string): string {
  let h = 0
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) >>> 0
  return AVATARS[h % AVATARS.length] ?? 'floppy-disk'
}
