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

async function connect(code: string, playerId: string, nickname: string): Promise<Client> {
  const url = `${WS_BASE}/api/rooms/${code}/ws?playerId=${playerId}&nickname=${encodeURIComponent(nickname)}`
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

async function newRoom(): Promise<string> {
  const response = await fetch(`${BASE}/api/rooms`, { method: 'POST' })
  const body = (await response.json()) as { code?: string }
  if (typeof body.code !== 'string') throw new Error('방 코드를 못 받았다')
  return body.code
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

  const last = clients[CAPACITY - 1]
  const snapshot = last === undefined ? undefined : seen(last, 'snapshot')[0]
  const participants = (snapshot?.['participants'] ?? []) as unknown[]
  check(participants.length === CAPACITY, '스냅샷에 8명이 다 보인다', `${participants.length}명`)

  const first = clients[0]
  const joined = first === undefined ? 0 : seen(first, 'joined').length
  check(joined >= CAPACITY - 1, '먼저 들어온 사람이 나머지 입장을 다 받았다', `joined ${joined}`)

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

// ── 실행 ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`retro-party 관문 검증 — ${BASE}`)

  const clients = await gateCapacity()
  await gateChatLatency(clients)
  for (const client of clients) client.socket.close()

  await gameRoundtrip()
  await gateTeamIsolation()

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
