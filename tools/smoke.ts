/**
 * Phase 0.5 관문 검증 — 07 문서 §G0.5
 *
 *   1. 8명 동시 접속
 *   2. 채팅 왕복 p95 < 150ms
 *   3. 진행 중 재접속 시 점수 유지
 *   4. 팀 채널이 상대 팀에 새지 않는다
 *
 * 눈으로 판단하지 않는다. 실패하면 exit 1.
 *
 *   pnpm smoke                     기본 http://127.0.0.1:8787
 *   pnpm smoke https://api...      배포본 검증
 */

import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const WS_BASE = BASE.replace(/^http/, 'ws')
const CAPACITY = 8
const P95_BUDGET_MS = 150

type Json = Record<string, unknown>

interface Client {
  readonly playerId: string
  readonly nickname: string
  readonly socket: WebSocket
  readonly inbox: Json[]
  /** 자기 채팅이 되돌아오기를 기다리는 타이머 */
  pending: Map<string, number>
  readonly roundTrips: number[]
}

const failures: string[] = []

function check(ok: boolean, label: string, detail = ''): void {
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(`  ${mark}  ${label}${detail === '' ? '' : `  ${detail}`}`)
  if (!ok) failures.push(label)
}

async function connect(
  code: string,
  playerId: string,
  nickname: string,
  ticket: string | null = null,
): Promise<Client> {
  const query = new URLSearchParams({ playerId, nickname })
  if (ticket !== null) query.set('ticket', ticket)
  const url = `${WS_BASE}/api/rooms/${code}/ws?${query.toString()}`
  const socket = new WebSocket(url)
  const client: Client = {
    playerId,
    nickname,
    socket,
    inbox: [],
    pending: new Map(),
    roundTrips: [],
  }

  socket.addEventListener('message', (event: MessageEvent) => {
    const data: unknown = JSON.parse(String(event.data))
    if (typeof data !== 'object' || data === null) return
    const message = data as Json

    if (message['type'] === 'chat') {
      const line = message['line'] as Json | undefined
      const text = typeof line?.['text'] === 'string' ? line['text'] : ''
      const sentAt = client.pending.get(text)
      if (sentAt !== undefined && line?.['from'] === playerId) {
        client.roundTrips.push(performance.now() - sentAt)
        client.pending.delete(text)
      }
    }
    client.inbox.push(message)
  })

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error(`연결 실패: ${nickname}`)), {
      once: true,
    })
  })
  return client
}

function send(client: Client, message: Json): void {
  client.socket.send(JSON.stringify(message))
}

function chat(client: Client, text: string, channel: 'all' | 'team' = 'all'): void {
  client.pending.set(text, performance.now())
  send(client, { type: 'chat', text, channel })
}

const seen = (client: Client, type: string): Json[] =>
  client.inbox.filter((m) => m['type'] === type)

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index] ?? Number.NaN
}

interface NewRoomInput {
  readonly title?: string
  readonly gameId?: string
  readonly mode?: string
  readonly rounds?: number
  readonly isPublic?: boolean
  readonly password?: string
}

async function newRoom(input: NewRoomInput = {}): Promise<string> {
  const response = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '검증용 방', rounds: 3, ...input }),
  })
  const body = (await response.json()) as { code?: string }
  if (typeof body.code !== 'string') throw new Error('방 코드를 못 받았다')
  return body.code
}

interface ListedRoom {
  readonly code: string
  readonly title: string
  readonly players: number
  readonly locked: boolean
  readonly gameId: string
}

async function listRooms(): Promise<readonly ListedRoom[]> {
  const response = await fetch(`${BASE}/api/rooms`)
  const body = (await response.json()) as { rooms?: ListedRoom[] }
  return body.rooms ?? []
}

/** 소켓이 실제로 열리는지 본다. 열리면 바로 닫는다 */
function canOpen(code: string, ticket: string | null): Promise<boolean> {
  const query = new URLSearchParams({ playerId: 'probe', nickname: '탐침' })
  if (ticket !== null) query.set('ticket', ticket)
  const socket = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws?${query.toString()}`)

  return new Promise<boolean>((resolve) => {
    const settle = (ok: boolean): void => {
      socket.close()
      resolve(ok)
    }
    socket.addEventListener('open', () => settle(true), { once: true })
    socket.addEventListener('error', () => settle(false), { once: true })
    socket.addEventListener('close', () => resolve(false), { once: true })
  })
}

async function ticketFor(code: string, password: string): Promise<string | null> {
  const response = await fetch(`${BASE}/api/rooms/${code}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { ticket?: string | null }
  return body.ticket ?? null
}

// ── 1 · 8명 동시 접속 ────────────────────────────────

async function gateCapacity(): Promise<Client[]> {
  console.log('\n1. 8명 동시 접속')
  const code = await newRoom()
  const started = performance.now()

  const clients = await Promise.all(
    Array.from({ length: CAPACITY }, (_, i) =>
      connect(code, `p${i}`, `테스터${i}`),
    ),
  )
  const elapsed = performance.now() - started
  await sleep(400)

  check(
    clients.every((c) => c.socket.readyState === WebSocket.OPEN),
    '8개 소켓이 전부 열렸다',
    `${elapsed.toFixed(0)}ms`,
  )

  // 동시에 붙으면 첫 스냅샷은 부분적일 수 있다. 뒤따르는 joined 로 따라잡는
  // 것이 정상 동작이므로, 순간이 아니라 수렴한 결과를 본다 (client-state 리듀서와 같은 접기)
  const rosterSizes = clients.map((client) => {
    const ids = new Set<string>()
    for (const message of client.inbox) {
      if (message['type'] === 'snapshot') {
        for (const p of (message['participants'] ?? []) as { playerId?: string }[]) {
          if (typeof p.playerId === 'string') ids.add(p.playerId)
        }
      }
      if (message['type'] === 'joined') {
        const p = message['participant'] as { playerId?: string } | undefined
        if (typeof p?.playerId === 'string') ids.add(p.playerId)
      }
    }
    return ids.size
  })
  check(
    rosterSizes.every((n) => n === CAPACITY),
    '모두의 화면이 8명으로 수렴한다',
    rosterSizes.join('·'),
  )

  // 9번째는 거절돼야 한다
  const extra = await connect(code, 'p8', '아홉번째')
  await sleep(300)
  const rejected = seen(extra, 'error').some((m) => m['code'] === 'room_full')
  check(rejected, '9번째는 room_full 로 거절된다')
  extra.socket.close()

  return clients
}

// ── 2 · 채팅 왕복 ────────────────────────────────────

async function gateChatLatency(clients: readonly Client[]): Promise<void> {
  console.log('\n2. 채팅 왕복 지연')
  const rounds = 12

  for (let i = 0; i < rounds; i++) {
    for (const client of clients) chat(client, `왕복측정-${client.playerId}-${i}`)
    // 초당 1건 제한(01 문서 §6)에 걸리지 않게 띄운다
    await sleep(1_100)
  }
  await sleep(500)

  const all = clients.flatMap((c) => c.roundTrips)
  const p50 = percentile(all, 50)
  const p95 = percentile(all, 95)

  check(all.length >= rounds * clients.length * 0.9, '보낸 채팅이 거의 다 돌아왔다', `${all.length}건`)
  check(p95 < P95_BUDGET_MS, `왕복 p95 < ${P95_BUDGET_MS}ms`, `p50 ${p50.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms`)

  // 도배 차단이 살아 있는가
  const victim = clients[0]
  if (victim !== undefined) {
    for (let i = 0; i < 5; i++) send(victim, { type: 'chat', text: `도배${i}`, channel: 'all' })
    await sleep(400)
    const limited = seen(victim, 'error').some((m) => m['code'] === 'rate_limited')
    check(limited, '연속 입력은 rate_limited 로 막힌다')
  }
}

// ── 3 · 진행과 재접속 ────────────────────────────────

async function gameRoundtrip(): Promise<void> {
  console.log('\n3. 라운드 진행과 재접속')
  const code = await newRoom()
  const a = await connect(code, 'h0', '방장')
  const b = await connect(code, 'h1', '둘째')
  await sleep(300)

  send(a, { type: 'settings', patch: { rounds: 3 } })
  await sleep(200)
  send(a, { type: 'start' })
  await sleep(4_000) // 카운트다운 3초 + 여유

  const phases = seen(a, 'phase').map((m) => (m['phase'] as Json | undefined)?.['kind'])
  check(phases.includes('countdown'), '카운트다운에 들어갔다')
  check(phases.includes('playing'), '라운드가 시작됐다')

  const boards = seen(b, 'board')
  const board = boards[0]?.['view'] as Json | undefined
  check(board !== undefined && typeof board['chosung'] === 'string', 'board 에 초성이 왔다')
  check(
    boards.every((m) => {
      const view = m['view'] as Json | undefined
      return view === undefined || !('word' in view) && !('answers' in view)
    }),
    '★ board 에 정답 필드가 없다',
  )

  // 진행 중 끊고 다시 붙는다
  b.socket.close()
  await sleep(600)
  const bAgain = await connect(code, 'h1', '둘째')
  await sleep(600)

  const snapshot = seen(bAgain, 'snapshot')[0]
  const participants = (snapshot?.['participants'] ?? []) as { playerId?: string }[]
  check(
    participants.some((p) => p.playerId === 'h1'),
    '재접속하면 원래 자리로 돌아온다',
  )
  check(
    (snapshot?.['phase'] as Json | undefined)?.['kind'] !== 'lobby',
    '재접속해도 판이 로비로 돌아가지 않는다',
    String((snapshot?.['phase'] as Json | undefined)?.['kind']),
  )

  a.socket.close()
  bAgain.socket.close()
}

// ── 4 · 팀 채널 격리 ─────────────────────────────────

async function gateTeamIsolation(): Promise<void> {
  console.log('\n4. 팀 채널 격리')
  const code = await newRoom()
  const clients = await Promise.all(
    Array.from({ length: 4 }, (_, i) => connect(code, `t${i}`, `팀원${i}`)),
  )
  await sleep(300)

  const host = clients[0]
  if (host === undefined) return
  send(host, { type: 'settings', patch: { mode: 'team', rounds: 2 } })
  await sleep(200)
  send(host, { type: 'start' })
  await sleep(4_000)

  const snapshots = clients.map((c) => seen(c, 'snapshot').at(-1))
  const teams = snapshots.map((s) => s?.['yourTeam'])
  check(
    teams.filter((t) => t === 0).length === 2 && teams.filter((t) => t === 1).length === 2,
    '2대2 로 나뉘었다',
    JSON.stringify(teams),
  )

  // 숫자를 넣으면 계좌번호 마스킹(chat.ts MASK_PATTERNS)에 걸려 본문이 바뀐다.
  // 그러면 "안 샜다" 가 공허하게 통과하므로 반드시 순수 문자로 만든다
  const secret = `팀비밀${'가나다라마바사아자차'[Math.floor(Math.random() * 10)] ?? '가'}${'ABCDEFGH'[Math.floor(Math.random() * 8)] ?? 'A'}`
  chat(host, secret, 'team')
  await sleep(600)

  const hostTeam = teams[0]
  let leaked = false
  let delivered = 0
  clients.forEach((client, i) => {
    const got = seen(client, 'chat').some((m) => (m['line'] as Json | undefined)?.['text'] === secret)
    if (!got) return
    delivered += 1
    if (teams[i] !== hostTeam) leaked = true
  })

  // delivered 를 먼저 본다. 아무한테도 안 갔으면 "안 샜다" 는 아무 의미가 없다
  check(delivered === 2, '같은 팀 2명만 받았다', `${delivered}명`)
  check(delivered > 0 && !leaked, '★ 팀 채널이 상대 팀에 새지 않는다')

  for (const client of clients) client.socket.close()
}

// ── 5 · 게임 3종 ─────────────────────────────────────

async function gateAllGames(): Promise<void> {
  console.log('\n5. 게임 3종이 각각 돈다')

  const response = await fetch(`${BASE}/api/games`)
  const body = (await response.json()) as { games?: { id: string; name: string }[] }
  const games = body.games ?? []
  check(games.length >= 3, '게임이 3종 이상 등록됐다', games.map((g) => g.name).join(' · '))

  // 게임마다 board 의 모양이 다르다. 여기를 확인하지 않으면
  // "고른 게임과 실제 도는 게임이 다르다" 를 못 잡는다
  const SHAPE: Readonly<Record<string, string>> = {
    chosung: 'chosung',
    geuhae: 'hints',
    assoc: 'role',
  }

  for (const game of games) {
    const code = await newRoom({ gameId: game.id, rounds: 2, title: `${game.name} 검증` })
    const a = await connect(code, 'g0', '방장')
    const b = await connect(code, 'g1', '둘째')
    await sleep(300)
    send(a, { type: 'start' })
    await sleep(4_500)

    const boards = seen(b, 'board')
    const board = boards.at(-1)?.['view'] as Json | undefined
    check(board !== undefined, `${game.name} — board 가 온다`)

    const marker = SHAPE[game.id]
    check(
      marker !== undefined && board !== undefined && marker in board,
      `${game.name} — ★ 고른 게임이 실제로 돈다`,
      `기대 필드 ${marker} · 받은 필드 ${Object.keys(board ?? {}).join(',')}`,
    )

    // 어떤 게임이든 board 에 정답 필드가 있으면 안 된다.
    // 단어 연상 출제자만 예외인데, 여기서는 b(맞히는 쪽) 를 본다
    const leaked = boards.some((m) => {
      const v = m['view'] as Json | undefined
      return v !== undefined && ('word' in v || 'answers' in v || 'year' in v)
    })
    check(!leaked, `${game.name} — ★ 맞히는 사람 board 에 정답이 없다`)

    a.socket.close()
    b.socket.close()
    await sleep(200)
  }
}

// ── 6 · 방 목록 ──────────────────────────────────────

async function gateRoomList(): Promise<void> {
  console.log('\n6. 방 목록과 뭉치기 압력')

  const emptyCode = await newRoom({ title: '빈 방' })
  await sleep(400)
  const withEmpty = await listRooms()
  check(
    !withEmpty.some((r) => r.code === emptyCode),
    '★ 빈 방은 목록에 안 나온다',
    '분산을 막는 규칙 (03 문서 §4.2)',
  )

  const liveCode = await newRoom({ title: '사람 있는 방' })
  const a = await connect(liveCode, 'l0', '먼저온사람')
  await sleep(600)

  const listed = await listRooms()
  const mine = listed.find((r) => r.code === liveCode)
  check(mine !== undefined, '사람이 들어오면 목록에 뜬다')
  check(mine?.title === '사람 있는 방', '방 제목이 그대로 나온다', mine?.title ?? '')
  check(mine?.players === 1, '인원이 실제 접속자 수다', String(mine?.players))

  // 비공개 방은 목록에 없다
  const privateCode = await newRoom({ title: '비공개', isPublic: false })
  const p = await connect(privateCode, 'l9', '비공개유저')
  await sleep(600)
  check(
    !(await listRooms()).some((r) => r.code === privateCode),
    '비공개 방은 목록에 안 나온다',
  )
  p.socket.close()

  // 정렬 — 사람 많은 방이 위
  const busyCode = await newRoom({ title: '사람 많은 방' })
  const crowd = await Promise.all(
    Array.from({ length: 3 }, (_, i) => connect(busyCode, `c${i}`, `사람${i}`)),
  )
  await sleep(700)
  const sorted = await listRooms()
  check(sorted[0]?.code === busyCode, '★ 사람 많은 방이 맨 위', sorted.map((r) => r.players).join('>'))

  a.socket.close()
  for (const client of crowd) client.socket.close()
  await sleep(300)
}

// ── 7 · 비밀번호 ─────────────────────────────────────

async function gatePassword(): Promise<void> {
  console.log('\n7. 방 비밀번호')

  const code = await newRoom({ title: '잠긴 방', password: 'hunter2' })
  const state = await fetch(`${BASE}/api/rooms/${code}/state`).then((r) => r.json())
  check((state as Json)['locked'] === true, '잠금 상태가 노출된다 (불리언만)')
  check(
    !JSON.stringify(state).includes('hunter2'),
    '★ 상태 응답에 비밀번호가 없다',
  )

  check((await ticketFor(code, 'wrong')) === null, '틀린 비밀번호는 티켓을 못 받는다')

  const ticket = await ticketFor(code, 'hunter2')
  check(ticket !== null, '맞는 비밀번호는 티켓을 받는다')

  // 티켓 없이 소켓을 열면 거절. node fetch 는 Upgrade 헤더를 막으므로 진짜 소켓으로 잰다
  check(!(await canOpen(code, null)), '★ 티켓 없이는 소켓이 안 열린다')
  check(!(await canOpen(code, 'made-up-ticket')), '★ 아무 티켓이나 통하지 않는다')

  if (ticket !== null) {
    const client = await connect(code, 'pw0', '입장자', ticket)
    await sleep(400)
    check(seen(client, 'snapshot').length > 0, '티켓이 있으면 들어간다')
    check(
      !JSON.stringify(client.inbox).includes('hunter2'),
      '★ 어떤 서버 메시지에도 비밀번호가 없다',
    )

    // 티켓은 1회용
    const reused = await ticketFor(code, 'hunter2')
    check(reused !== ticket, '티켓은 매번 새로 발급된다')
    client.socket.close()
  }

  // 잠긴 방은 [바로 참가] 대상이 아니다
  const quick = await fetch(`${BASE}/api/rooms/quick`, { method: 'POST' })
  const target = ((await quick.json()) as { code?: string | null }).code ?? null
  check(target !== code, '잠긴 방은 바로 참가로 배정되지 않는다')
}

// ── 8 · 혼자 모드 ────────────────────────────────────

async function gateSolo(): Promise<void> {
  console.log('\n8. 혼자 모드')

  const code = await newRoom({ gameId: 'assoc', mode: 'solo', rounds: 2, isPublic: false })
  const alone = await connect(code, 's0', '혼자')
  await sleep(300)

  send(alone, { type: 'start' })
  await sleep(4_500)

  const phases = seen(alone, 'phase').map((m) => (m['phase'] as Json | undefined)?.['kind'])
  check(phases.includes('playing'), '★ 혼자서도 시작된다')

  const board = seen(alone, 'board').at(-1)?.['view'] as Json | undefined
  check(board?.['role'] === 'guesser', '가짜 출제자를 세우지 않는다', String(board?.['role']))
  check(board?.['presenter'] === null, 'presenter 가 null 이다')
  const script = Array.isArray(board?.['script']) ? (board['script'] as string[]) : []
  check(script.length > 0, '설명 스크립트가 문제의 일부로 열린다', `${script.length}단계`)
  check(
    !JSON.stringify(board).includes('word'),
    '★ 혼자 모드 board 에도 정답이 없다',
  )

  alone.socket.close()
}

// ── 실행 ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`retro-party 관문 검증 — ${BASE}`)

  const clients = await gateCapacity()
  await gateChatLatency(clients)
  for (const client of clients) client.socket.close()

  await gameRoundtrip()
  await gateTeamIsolation()
  await gateAllGames()
  await gateRoomList()
  await gatePassword()
  await gateSolo()

  console.log('')
  if (failures.length > 0) {
    console.error(`실패 ${failures.length}건`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('전 항목 통과.')
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error('\n검증 중 오류:', error)
  process.exit(1)
})
