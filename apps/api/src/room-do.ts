import { DurableObject } from 'cloudflare:workers'
import {
  asPlayerId,
  asRoomId,
  asSeed,
  parseClientMessage,
  parseTopics,
  ROOM_CAPACITY,
  type Participant,
  type PlayerId,
  type RoomCode,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
  type TeamId,
} from '@retro/types'
import {
  createEngine,
  lineFor,
  normalizeRoomTitle,
  shouldDeliver,
  type Effect,
  type Engine,
} from '@retro/room-kit'
import {
  hashPassword,
  newTicket,
  normalizePassword,
  pruneTickets,
  TICKET_TTL_MS,
  verifyPassword,
  type PasswordHash,
} from './auth.ts'
import { resolveGame, DEFAULT_GAME_ID, isKnownGame, type AnyGame } from './registry.ts'

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
  /** 비밀번호가 걸려 있는지 여부만. 해시는 별도 키에 둔다 */
  readonly locked: boolean
}

export interface RoomStateSummary {
  readonly code: string
  readonly title: string
  readonly phase: string
  readonly players: number
  readonly capacity: number
  readonly gameId: string
  readonly mode: string
  readonly locked: boolean
}

export type CreateResult =
  | { readonly ok: true; readonly code: string; readonly title: string; readonly gameId: string; readonly locked: boolean }
  | { readonly ok: false; readonly error: string }

const STORAGE_KEY = 'room'
/** 비밀번호 해시는 방 상태와 분리된 키에 둔다. 실수로 브로드캐스트되지 않게 */
const AUTH_KEY = 'auth'
const TICKET_KEY = 'tickets'

export class RoomDO extends DurableObject<Env> {
  private engine: Engine<unknown, unknown> | null = null
  private game: AnyGame = resolveGame(DEFAULT_GAME_ID)
  private booted = false

  // ── 부팅 ───────────────────────────────────────────

  /** 하이버네이션에서 깨어났을 때 방 상태를 되살린다 */
  private async boot(code: string): Promise<Engine<unknown, unknown>> {
    if (this.engine !== null) return this.engine

    const saved = await this.ctx.storage.get<PersistedRoom>(STORAGE_KEY)
    const settings: RoomSettings = saved?.settings ?? {
      gameId: DEFAULT_GAME_ID,
      mode: 'casual',
      rounds: 5,
      teamSize: null,
      isPublic: true,
      title: '새 방',
      topics: [],
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
      locked: saved?.locked ?? false,
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
      locked: room.locked,
    }
    await this.ctx.storage.put(STORAGE_KEY, data)
  }

  // ── HTTP ───────────────────────────────────────────

  /**
   * 방 상태 — RPC.
   *
   * 예전에는 `/state` 경로를 fetch 로 불렀다. 메서드로 부르면 반환 타입이
   * 경계를 넘어서도 살아 있어서, 필드 이름을 바꿔도 호출부가 컴파일에서 잡힌다.
   */
  async state(code: string): Promise<RoomStateSummary> {
    const engine = await this.boot(code)
    const { room } = engine.state
    return {
      code: room.code,
      title: room.settings.title,
      phase: room.phase.kind,
      players: room.participants.filter((p) => p.connected).length,
      capacity: ROOM_CAPACITY,
      gameId: room.settings.gameId,
      mode: room.settings.mode,
      locked: room.locked,
    }
  }

  /**
   * WebSocket 업그레이드만 fetch 로 남는다.
   *
   * 소켓 업그레이드는 RPC 로 못 한다 — 반환값이 값이 아니라 **연결**이라서
   * 구조화 복제로 옮길 수 있는 종류가 아니다. 이건 fetch 의 몫이다.
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

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

    // 잠긴 방은 티켓이 있어야 들어온다
    if (engine.state.room.locked && !(await this.consumeTicket(url.searchParams.get('ticket')))) {
      return new Response('비밀번호가 필요합니다', { status: 403 })
    }

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

  /** 방을 만든다 — RPC. 이미 쓰는 방이면 만들지 않는다 */
  async create(code: string, input: Record<string, unknown>): Promise<CreateResult> {
    const engine = await this.boot(code)
    if (engine.state.room.participants.length > 0) {
      return { ok: false, error: '이미 사용 중인 방입니다' }
    }

    const rawTitle = typeof input['title'] === 'string' ? input['title'] : ''
    const title = normalizeRoomTitle(rawTitle) ?? '새 방'
    const gameId =
      typeof input['gameId'] === 'string' && isKnownGame(input['gameId'])
        ? (input['gameId'] as RoomSettings['gameId'])
        : DEFAULT_GAME_ID
    const mode = parseMode(input['mode'])
    const rounds = clampRounds(input['rounds'])
    const isPublic = input['isPublic'] !== false
    const topics = parseTopics(input['topics'])

    const password = normalizePassword(input['password'])
    if (password !== null) {
      await this.ctx.storage.put<PasswordHash>(AUTH_KEY, await hashPassword(password))
    }

    engine.settingsUnchecked({ gameId, mode, rounds, isPublic, title, topics })
    engine.setLocked(password !== null)
    await this.persist()

    // ★ 엔진은 생성 시점의 게임 모듈을 붙들고 있다.
    //   설정만 바꾸면 고른 게임이 아니라 기본 게임이 계속 돈다. 반드시 다시 만든다
    await this.rebuildEngine()
    await this.reportToLobby()
    return { ok: true, code, title, gameId, locked: password !== null }
  }

  /**
   * 게임이 바뀌면 엔진을 다시 만든다.
   *
   * `createEngine` 은 게임 모듈을 클로저에 가둔다. 그래서 settings.gameId 만
   * 갈아끼우면 화면에는 새 게임 이름이 뜨는데 실제로는 옛 게임이 돈다.
   * 로비에서만 호출한다 — 진행 중에 바꾸면 라운드가 깨진다.
   */
  private async rebuildEngine(): Promise<void> {
    this.engine = null
    this.booted = false
    await this.boot('')
  }

  /** 비밀번호를 확인하고 1회용 티켓을 내준다 — RPC */
  async issueTicket(code: string, password: unknown): Promise<string | null> {
    const engine = await this.boot(code)
    if (!engine.state.room.locked) return null

    const attempt = normalizePassword(password)
    const stored = await this.ctx.storage.get<PasswordHash>(AUTH_KEY)
    if (attempt === null || stored === undefined || !(await verifyPassword(stored, attempt))) {
      return null
    }

    const nowMs = Date.now()
    const saved = (await this.ctx.storage.get<[string, number][]>(TICKET_KEY)) ?? []
    const tickets = pruneTickets(new Map(saved), nowMs)
    const ticket = newTicket()
    tickets.set(ticket, nowMs + TICKET_TTL_MS)
    await this.ctx.storage.put(TICKET_KEY, [...tickets])

    return ticket
  }

  /** 티켓은 한 번 쓰면 버린다 */
  private async consumeTicket(ticket: string | null): Promise<boolean> {
    if (ticket === null || ticket.length === 0) return false
    const nowMs = Date.now()
    const saved = (await this.ctx.storage.get<[string, number][]>(TICKET_KEY)) ?? []
    const tickets = pruneTickets(new Map(saved), nowMs)
    if (!tickets.has(ticket)) return false
    tickets.delete(ticket)
    await this.ctx.storage.put(TICKET_KEY, [...tickets])
    return true
  }

  /** 방 목록에 자기 상태를 알린다. 실패해도 게임은 계속 돌아야 한다 */
  private async reportToLobby(): Promise<void> {
    const engine = this.engine
    if (engine === null) return
    const { room } = engine.state
    if (!room.settings.isPublic || room.settings.mode === 'solo') return

    const summary = {
      code: room.code,
      title: room.settings.title,
      gameId: room.settings.gameId,
      mode: room.settings.mode,
      players: room.participants.filter((p) => p.connected).length,
      capacity: ROOM_CAPACITY,
      phase: room.phase.kind,
      locked: room.locked,
    }
    try {
      // RPC — 경로도 JSON 도 없다. 메서드를 그냥 부른다
      await this.env.LOBBY.get(this.env.LOBBY.idFromName('global')).report(summary)
    } catch {
      // 목록이 잠깐 낡는 것은 감수한다. 방이 멈추면 안 된다
    }
  }

  // ── WebSocket ──────────────────────────────────────

  override async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> {
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
      case 'skip':
        return this.dispatch(engine.skip(playerId, nowMs))
      case 'hint':
        return this.dispatch(engine.hint(playerId, nowMs))
      case 'stroke':
        return this.dispatch(
          engine.stroke({
            playerId,
            color: message.color,
            width: message.width,
            points: message.points,
          }),
        )
      case 'canvas':
        return this.dispatch(engine.canvas(playerId, message.action))
      case 'settings': {
        const before = engine.state.room.settings.gameId
        const effects = engine.settings(playerId, message.patch, nowMs)
        await this.dispatch(effects)

        // 게임을 갈아탔으면 엔진을 다시 세우고 모두에게 새 스냅샷을 보낸다
        if (this.engine !== null && this.engine.state.room.settings.gameId !== before) {
          await this.rebuildEngine()
          const rebuilt = this.engine
          if (rebuilt !== null) {
            for (const socket of this.ctx.getWebSockets()) {
              const who = this.attachmentOf(socket)
              if (who !== null) this.send(socket, rebuilt.snapshotFor(asPlayerId(who.playerId)))
            }
          }
        }
        return
      }
      case 'kick':
        // Phase 0.5 미구현. 방장 권한 검증부터 필요하다
        return
      case 'ping':
        this.send(ws, { type: 'phase', phase: engine.state.room.phase })
        return
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = this.attachmentOf(ws)
    if (attachment === null || this.engine === null) return
    await this.dispatch(this.engine.leave(asPlayerId(attachment.playerId), Date.now()))
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  override async alarm(): Promise<void> {
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
          // ★ 두 가지를 수신자마다 다르게 처리한다.
          //   1. 팀 채널은 같은 팀에게만 — 새면 팀전이 무너진다
          //   2. 정답 원문은 이미 맞힌 사람에게만 — 새면 나머지가 베낀다
          for (const ws of this.ctx.getWebSockets()) {
            const attachment = this.attachmentOf(ws)
            if (attachment === null) continue
            const viewer = asPlayerId(attachment.playerId)
            if (!shouldDeliver(effect, this.teamOf(viewer))) continue
            const message: ServerMessage = { type: 'chat', line: lineFor(effect, viewer) }
            this.send(ws, message)
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
    await this.reportToLobby()
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

function parseMode(raw: unknown): RoomSettings['mode'] {
  return raw === 'team' || raw === 'solo' || raw === 'rank' ? raw : 'casual'
}

/** 0 은 무제한이다 (UNLIMITED_ROUNDS). 그래서 하한이 1 이 아니라 0 이다 */
function clampRounds(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.round(raw) : 5
  return Math.min(20, Math.max(0, Number.isFinite(n) ? n : 5))
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
