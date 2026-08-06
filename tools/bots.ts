/**
 * 개발용 임시 플레이어 — 혼자 붙어봐도 방이 돌아가게 한다.
 *
 * **이건 제품 기능이 아니다.** 서버에는 가짜 참가자를 만드는 코드가 없고,
 * 여기 있는 봇들은 브라우저와 똑같이 WebSocket 으로 붙는 진짜 클라이언트다.
 * 서버 입장에서는 사람 4명이 들어온 것과 구별되지 않는다 — 그게 핵심이다.
 * (배포본에서는 이 스크립트를 돌리지 않으면 그만이다.)
 *
 *   pnpm bots ABCDEF              방 코드에 4명 붙인다
 *   pnpm bots ABCDEF 2            2명만
 *   pnpm bots ABCDEF 4 비번       비밀번호 방
 *
 * 봇은 화면에 보이는 것(board 뷰)만 보고, 샘플 데이터에서 답을 역추적한다.
 * 실력을 일부러 낮춰 두어 사람이 이길 수 있게 해뒀다.
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { SAMPLE_WORDS as CHOSUNG_WORDS } from '@retro/game-chosung'
import { SAMPLE_YEARS } from '@retro/game-geuhae'
import { SAMPLE_WORDS as ASSOC_WORDS } from '@retro/game-assoc'
import { syllableLength, toChosung } from '@retro/room-kit'

const BASE = process.env['RETRO_API'] ?? 'http://127.0.0.1:8787'
const code = process.argv[2]
const count = Number(process.argv[3] ?? '4')
const password = process.argv[4] ?? null

if (code === undefined || code.length !== 6) {
  console.error('사용법: pnpm bots <방코드 6자리> [인원=4] [비밀번호]')
  process.exit(1)
}

const NAMES = ['감자탕러버', 'ㅋㅋ루삥뽕', '야타족', '오락실죽순이', '삐삐맨', '96학번'] as const

/** 사람이 이길 여지를 남긴다. 값이 클수록 느리게 답한다 */
const THINK_MIN_MS = 3_500
const THINK_MAX_MS = 11_000
/** 이 확률로는 아예 못 맞힌 척한다 */
const MISS_RATE = 0.35

const CHATTER = [
  '아 이거 아는데',
  '뭐더라…',
  '입에서 맴돈다',
  'ㅋㅋㅋ',
  '어렵네',
  '아 맞다',
  '우리 집에 있었는데',
  '힌트 좀',
] as const

const REACTION = ['오', '헐 빠르다', '아 그거였네', 'ㅋㅋㅋㅋ', '아깝다'] as const

type Json = Record<string, unknown>

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T
const wait = (lo: number, hi: number) => sleep(lo + Math.random() * (hi - lo))

interface Bot {
  readonly id: string
  readonly name: string
  readonly socket: WebSocket
  /** 이번 라운드에 이미 답했는가 */
  answered: boolean
  /** 이번 라운드 출제자인가 (단어 연상) */
  presenting: boolean
  scriptStep: number
}

// ── 답 역추적 ────────────────────────────────────────
// 봇은 board 뷰만 본다. 정답은 서버에만 있으므로 샘플 풀에서 되짚는다.

function guessChosung(view: Json): string | null {
  const chosung = typeof view['chosung'] === 'string' ? view['chosung'] : null
  const length = typeof view['length'] === 'number' ? view['length'] : null
  if (chosung === null || length === null) return null

  const hits = CHOSUNG_WORDS.filter(
    (w) => toChosung(w.word) === chosung && syllableLength(w.word) === length,
  )
  return hits.length === 0 ? null : pick(hits).word
}

function guessYear(view: Json): string | null {
  const hints = Array.isArray(view['hints']) ? (view['hints'] as string[]) : []
  if (hints.length === 0) return null
  const first = hints[0]
  const hit = SAMPLE_YEARS.find((y) => y.hints[0] === first)
  return hit === undefined ? null : String(hit.year)
}

function guessAssoc(view: Json): string | null {
  const category = typeof view['category'] === 'string' ? view['category'] : null
  const length = typeof view['length'] === 'number' ? view['length'] : null
  if (category === null || length === null) return null

  const hits = ASSOC_WORDS.filter(
    (w) => w.category === category && syllableLength(w.word) === length,
  )
  return hits.length === 0 ? null : pick(hits).word
}

function answerFor(view: Json): string | null {
  if ('chosung' in view) return guessChosung(view)
  if ('hints' in view) return guessYear(view)
  if (view['role'] === 'guesser') return guessAssoc(view)
  return null
}

// ── 봇 ───────────────────────────────────────────────

async function ticketFor(): Promise<string | null> {
  if (password === null) return null
  const response = await fetch(`${BASE}/api/rooms/${code}/ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error('비밀번호가 틀렸습니다')
  const body = (await response.json()) as { ticket?: string | null }
  return body.ticket ?? null
}

async function spawn(index: number, ticket: string | null): Promise<Bot> {
  const id = `bot-${index}-${Math.random().toString(36).slice(2, 8)}`
  const name = NAMES[index % NAMES.length] ?? `봇${index}`
  const query = new URLSearchParams({ playerId: id, nickname: name })
  if (ticket !== null) query.set('ticket', ticket)

  const socket = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/rooms/${code}/ws?${query}`)
  const bot: Bot = { id, name, socket, answered: false, presenting: false, scriptStep: 0 }

  socket.addEventListener('message', (event: MessageEvent) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    void handle(bot, parsed as Json)
  })

  socket.addEventListener('close', () => console.log(`  ${name} 나감`))

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error(`${name} 연결 실패`)), { once: true })
  })
  console.log(`  ${name} 입장`)
  return bot
}

const say = (bot: Bot, text: string): void => {
  if (bot.socket.readyState !== WebSocket.OPEN) return
  bot.socket.send(JSON.stringify({ type: 'chat', text, channel: 'all' }))
}

async function handle(bot: Bot, message: Json): Promise<void> {
  if (message['type'] === 'phase') {
    const phase = message['phase'] as Json | undefined
    if (phase?.['kind'] === 'playing') {
      bot.answered = false
      bot.presenting = false
      bot.scriptStep = 0
    }
    return
  }

  if (message['type'] === 'chat') {
    const line = message['line'] as Json | undefined
    // 남이 맞히면 가끔 반응한다
    if (line?.['correct'] != null && line['from'] !== bot.id && Math.random() < 0.3) {
      await wait(400, 1_200)
      say(bot, pick(REACTION))
    }
    return
  }

  if (message['type'] !== 'board') return
  const view = message['view'] as Json | undefined
  if (view === undefined) return

  // 단어 연상 출제자가 됐다 — 설명해야 라운드가 돈다
  if (view['role'] === 'presenter' && !bot.presenting) {
    bot.presenting = true
    void describe(bot, view)
    return
  }

  if (bot.answered || bot.presenting) return
  if (view['youSolved'] === true) {
    bot.answered = true
    return
  }

  bot.answered = true
  await wait(THINK_MIN_MS, THINK_MAX_MS)

  if (Math.random() < MISS_RATE) {
    say(bot, pick(CHATTER))
    return
  }

  const answer = answerFor(view)
  if (answer === null) {
    say(bot, pick(CHATTER))
    return
  }
  say(bot, answer)
}

/** 출제자 봇. 사전 스크립트가 아니라 자기 단어를 보고 즉석에서 설명한다 */
async function describe(bot: Bot, view: Json): Promise<void> {
  const word = typeof view['word'] === 'string' ? view['word'] : null
  if (word === null) return
  const entry = ASSOC_WORDS.find((w) => w.word === word)
  const lines = entry?.script ?? ['음… 설명하기 어렵네요', '힌트를 더 드릴게요', '거의 다 왔어요']

  for (const line of lines) {
    await wait(2_000, 4_000)
    if (bot.socket.readyState !== WebSocket.OPEN) return
    say(bot, line)
  }
}

// ── 실행 ─────────────────────────────────────────────

async function main(): Promise<void> {
  const n = Math.min(7, Math.max(1, Number.isFinite(count) ? count : 4))
  console.log(`방 ${code} 에 임시 플레이어 ${n}명을 붙입니다 — ${BASE}`)
  console.log('이 봇들은 브라우저와 똑같이 WebSocket 으로 붙습니다. 서버에는 가짜 참가자가 없습니다.\n')

  const ticket = await ticketFor()
  const bots: Bot[] = []
  for (let i = 0; i < n; i++) {
    // 비밀번호 방은 티켓이 1회용이라 사람마다 새로 받는다
    bots.push(await spawn(i, i === 0 ? ticket : await ticketFor()))
    await sleep(250)
  }

  console.log('\n붙었습니다. 브라우저에서 [시작] 을 누르세요.  Ctrl+C 로 종료합니다.')

  const bye = (): void => {
    for (const bot of bots) bot.socket.close()
    process.exit(0)
  }
  process.on('SIGINT', bye)
  process.on('SIGTERM', bye)

  // 로비에서도 가끔 떠든다. 조용한 방은 사람이 나간다
  while (true) {
    await sleep(8_000 + Math.random() * 12_000)
    const bot = pick(bots)
    if (!bot.presenting && Math.random() < 0.4) say(bot, pick(CHATTER))
  }
}

main().catch((error: unknown) => {
  console.error('\n봇 실행 실패:', error instanceof Error ? error.message : error)
  process.exit(1)
})
