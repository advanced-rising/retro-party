# 05. 기술 아키텍처

> 실시간 방이 본체이므로 **Durable Objects가 게임 서버**다.
> 방 하나 = DO 인스턴스 하나. 이게 이 문서의 전부라고 해도 된다.

## 1. 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트 | **Next.js 15 + TypeScript** on Workers (`@opennextjs/cloudflare`) | SSR, OG 카드, 엣지 |
| API | **Cloudflare Workers** (Hono) | 인증, 방 목록, 전적 조회 |
| **게임 서버** | **Durable Objects** ★ | 방 상태 + WebSocket + 타이머 |
| DB | **PostgreSQL** (Neon) + **Hyperdrive** | 계정 · 전적 · 콘텐츠 |
| 콘텐츠 캐시 | **Workers KV** | 문제 세트. 라운드 중 DB를 안 친다 |
| 오브젝트 | **R2** | 공유 이미지, 정적 에셋 |
| 배치 | **Cron Triggers** + Queues | 데일리 생성, 랭킹 정산 |
| 봇 방어 | **Turnstile** | 방 생성·계정 |
| 상태관리 | **Zustand** + WebSocket 훅 | |
| UI | **Tailwind v4 + shadcn/ui + Framer Motion** | 06 문서 |
| 콘텐츠 배치 | **NestJS** (Phase 2~) | 관리자, 파이프라인 |

## 2. 구성

```
┌─ Cloudflare Edge ─────────────────────────────────────────────┐
│  ┌─────────────────┐   ┌──────────────────────────────────┐   │
│  │ Worker: web     │   │ Worker: api                      │   │
│  │ Next.js         │   │ 인증 · 방 목록 · 전적 · 공유카드  │   │
│  └─────────────────┘   └────────────┬─────────────────────┘   │
│                                      │                         │
│  ┌───────────────────────────────────▼───────────────────────┐│
│  │ Durable Objects  ★ 게임 서버                               ││
│  │                                                            ││
│  │  RoomDO      방 하나 = 인스턴스 하나                       ││
│  │              · WebSocket 연결 (참가자 + 관전자)            ││
│  │              · 방 상태 · 라운드 진행 · 채팅 릴레이          ││
│  │              · 타이머 · AI 참가자 시뮬레이션                ││
│  │                                                            ││
│  │  LobbyDO     방 목록 집계 · 빠른 입장 배정 (게임별 1개)     ││
│  │  DailyDO     데일리 싱글 통계 집계                          ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  KV (문제 세트 · 방 목록 캐시)   R2   Cron   Turnstile          │
└────────────────────────────────┬──────────────────────────────┘
                                 │ Hyperdrive
                    ┌────────────▼─────────────┐
                    │  PostgreSQL              │
                    │  users · plays · rankings │
                    │  facts · hints · words    │  ← 콘텐츠 (04 문서)
                    └────────────▲─────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │  NestJS (Phase 2~)       │
                    │  콘텐츠 파이프라인·관리자 │
                    └──────────────────────────┘
```

**게임 플레이 중 PostgreSQL을 건드리지 않는다.** 문제 세트는 방 생성 시 KV에서 한 번에 받아두고, 전적은 게임 종료 시 한 번 쓴다.

## 3. RoomDO — 게임 서버

### 3.1 왜 Durable Objects인가

| | Durable Objects | 전통 서버 (Node + WS) |
|---|---|---|
| 스케일링 | 방마다 인스턴스 → **자동** | 인스턴스 관리 필요 |
| 상태 저장소 | DO 내부 | Redis 별도 필요 |
| 동시성 제어 | **단일 스레드 → 락 불필요** | 직접 처리 |
| 배포 | `wrangler deploy` | 별도 인프라 |
| 유휴 비용 | Hibernation | 상시 과금 |
| 지역 지연 | 인스턴스 위치 고정 | 마찬가지 |
| 로컬 개발 | 번거로움 | 편함 |

**단일 스레드가 특히 크다.** 8명이 동시에 정답을 쳐도 순서가 자동으로 정해진다. 락이나 트랜잭션이 필요 없다.

`locationHint: 'apac'` 으로 아시아에 고정한다. 주 사용자가 한국이라 지역 지연 문제가 사실상 없다.

### 3.2 구조

```ts
export class RoomDO implements DurableObject {
  private room!: RoomState
  private game!: RoomGame<unknown, unknown>   // 01 문서 §9
  private timers = new TimerQueue()

  // ── 입장 ─────────────────────────────────
  async fetch(req: Request) {
    const { playerId, role } = await authenticate(req)
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server, [playerId, role])   // 태그로 식별
    await this.onJoin(playerId, role)
    return new Response(null, { status: 101, webSocket: client })
  }

  // ── 메시지 ───────────────────────────────
  async webSocketMessage(ws: WebSocket, raw: string) {
    const [playerId] = this.ctx.getTags(ws)
    const msg = JSON.parse(raw)

    if (msg.type === 'chat') return this.onChat(playerId, msg.text)
    if (msg.type === 'start') return this.onStart(playerId)
    if (msg.type === 'emote') return this.onEmote(playerId, msg.id)
    // ...
  }

  // ── 채팅 = 정답 입력 ★ ────────────────────
  private async onChat(playerId: string, text: string, channel: 'team' | 'all') {
    if (!this.rateLimiter.allow(playerId)) return
    const clean = sanitize(text)                    // 필터 + 마스킹
    if (clean === null) return this.warn(playerId)

    // ★ 팀전에서는 팀 채널에서만 정답을 판정한다 (01 문서 §6.5.1)
    const judgeable = this.room.mode !== 'team' || channel === 'team'

    let judgement: Judgement | null = null
    if (this.room.phase === 'playing' && judgeable) {
      judgement = this.game.judge(
        this.room.question, playerId, clean, Date.now(),
      )
      if (judgement.correct) this.applyScore(playerId, judgement)
    }

    // 채팅은 저장하지 않는다 (08 문서)
    const packet = { type: 'chat', from: playerId, text: clean, judgement, channel }
    if (this.room.mode === 'team' && channel === 'team') {
      this.broadcastToTeam(this.teamOf(playerId), packet)   // ★ 같은 팀만
    } else {
      this.broadcast(packet)
    }

    if (this.game.isRoundOver(this.room.question, this.room.round)) {
      await this.endRound()
    }
  }

  // ── 타이머 ───────────────────────────────
  async alarm() { await this.timers.fire(Date.now()) }
}
```

**`onChat` 하나가 채팅과 정답 판정을 동시에 한다.** 01 문서의 "채팅이 곧 입력"이 코드에 그대로 드러난다.

**팀 브로드캐스트가 새면 팀전이 통째로 무너진다.** WebSocket 태그에 팀 번호를 넣어두고(`acceptWebSocket(ws, [playerId, role, teamId])`), 팀 채널 패킷은 태그로 필터해서만 보낸다. 테스트로 검증한다 (§9).

### 3.3 참가자별 뷰

단어 연상에서 출제자는 정답을 알고 나머지는 몰라야 한다. 팀전에서는 상대 팀 출제자의 단어도 가려야 한다.

```ts
private broadcastView() {
  for (const ws of this.ctx.getWebSockets()) {
    const [playerId] = this.ctx.getTags(ws)
    ws.send(JSON.stringify(
      this.game.viewFor(this.room.question, this.room.round, playerId)
    ))
  }
}
```

**정답이 클라이언트로 새는 경로를 하나로 좁힌다.** `viewFor`만 검증하면 된다. 테스트 필수 (§9).

### 3.4 AI 참가자 구현

AI는 **가짜 WebSocket 클라이언트가 아니다.** DO 안에서 타이머로 동작한다.

```ts
private scheduleAiForRound(q: Question) {
  for (const ai of this.room.aiPlayers) {
    const plan = planAiBehavior(ai.persona, q, this.humanCount(), this.seed)
    // plan = [{ atMs: 4200, kind: 'chat', text: '음...' },
    //         { atMs: 9800, kind: 'answer', text: '1997' }]
    for (const step of plan) this.timers.at(step.atMs, () => this.runAi(ai, step))
  }
}
```

- 라운드 시작 시 **행동 계획을 통째로 결정**해둔다. 시드 기반이라 재현 가능
- `planAiBehavior`는 **순수 함수**. 03 문서의 실력 조절(사람 수에 따라 하향)이 여기 들어간다
- 채팅 문구는 **사전 생성 풀**에서 뽑는다. **런타임 LLM 호출 없음**

DO가 단일 스레드라 AI 행동과 사람 입력이 자연스럽게 직렬화된다. 경합이 없다.

### 3.5 Hibernation

`acceptWebSocket()`으로 수락하면 유휴 시 DO가 메모리에서 내려갈 수 있다.

| 구간 | Hibernation |
|---|---|
| 대기실 (아무도 말 안 함) | ✅ 유효 — 비용 절감 |
| 라운드 진행 중 | ✕ 타이머가 계속 돌아 의미 없음 |

**대기실이 길어질 수 있으므로 켜둘 가치가 있다.** 단, `webSocketMessage()` 진입 시 상태를 스토리지에서 복원해야 한다.

> ⚠️ 구현 전 확인: DO 요금 체계, Hibernation과 `alarm()` 상호작용, `locationHint` 사용법.

## 4. LobbyDO — 방 목록

방 목록은 실시간성이 덜 중요하다. **몇 초 지연을 허용하고 단순하게 간다.**

```
RoomDO 상태 변경 (입장/퇴장/시작/종료)
  → KV에 방 요약 write  (rooms:{gameId}:{roomId})
  → LobbyDO에 알림

클라이언트
  → 방 목록: KV 읽기 (5초 폴링)
  → 빠른 입장: LobbyDO에 요청 → 최적 방 배정
```

**빠른 입장만 LobbyDO를 거친다.** 03 문서의 "뭉치기 압력" 로직이 여기 산다 — 인원이 가장 많으면서 자리가 남은 방을 고르고, 방 수 상한을 강제한다.

LobbyDO는 게임별 1개다. 병목이 되면 지역·버킷별로 샤딩한다.

## 5. 콘텐츠 로딩

```
방 생성
  → 게임 + 라운드 수 확정
  → KV에서 문제 세트 10개 로드 (1회)
  → DO 메모리에 보관

라운드 진행
  → DB 접근 0, KV 접근 0
```

KV에는 **게임별 문제 풀 인덱스**를 넣어둔다. Cron이 매일 갱신한다.

```
KV: content:geuhae:v42     → 연도별 힌트 세트
    content:chosung:v18    → 초성 문제 세트
    content:assoc:v9       → 단어 목록 + AI 설명 스크립트
```

**문제 세트가 KV 값 하나에 다 들어가지 않으면** 연도/카테고리별로 쪼개고, 방 생성 시 필요한 것만 병렬로 읽는다.

## 6. 데이터 모델

플레이 중에는 안 쓰고, 시작·종료 시점에만 쓴다.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  provider      TEXT,                    -- kakao|google|guest
  provider_uid  TEXT,
  nickname      TEXT NOT NULL,
  avatar        TEXT,                    -- 이모지 코드
  birth_decade  SMALLINT,                -- 선택. 세대 통계용
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE matches (                   -- 한 판
  id            UUID PRIMARY KEY,
  room_id       TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  mode          TEXT NOT NULL,           -- casual|team|rank  (01 문서 §1.5)
  team_size     SMALLINT,                -- 팀전만. 2|3|4
  rounds        SMALLINT,
  human_count   SMALLINT,
  ai_count      SMALLINT,                -- 03 문서 지표
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ
);

CREATE TABLE match_players (
  match_id      UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id       UUID,                    -- NULL = 게스트
  is_ai         BOOLEAN DEFAULT FALSE,
  ai_persona    TEXT,
  nickname      TEXT,
  team          SMALLINT,                -- 팀전만. 0=청 1=홍
  score         INTEGER,
  rank          SMALLINT,                -- 개인 순위
  team_rank     SMALLINT,                -- 팀 순위 (팀전만)
  correct_count SMALLINT,
  first_answer_ms INTEGER,               -- 하이라이트용
  chat_count    SMALLINT,
  PRIMARY KEY (match_id, nickname)
);

CREATE TABLE user_stats (                -- 집계 (배치 갱신)
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  matches       INTEGER DEFAULT 0,
  wins          INTEGER DEFAULT 0,
  total_score   BIGINT DEFAULT 0,
  best_streak   SMALLINT DEFAULT 0
);

CREATE TABLE daily_plays (               -- 데일리 싱글
  user_id       UUID,
  date          DATE,
  attempts      SMALLINT,
  solved        BOOLEAN,
  PRIMARY KEY (user_id, date)
);
```

**채팅 로그 테이블이 없다.** 저장하지 않는다 (08 문서).

## 7. 모노레포

```
geuttae/
├─ apps/
│  ├─ web/              Next.js
│  ├─ api/              Workers (Hono) + Durable Objects
│  └─ admin/            NestJS (Phase 2~)
├─ packages/
│  ├─ room-kit/         ★ RoomGame 인터페이스 · 방 상태 머신 · 타이머
│  ├─ games/
│  │  ├─ chosung/       초성 퀴즈
│  │  ├─ assoc/         단어 연상
│  │  └─ geuhae/        그 해
│  ├─ ai-player/        ★ 행동 계획 (순수 함수) + 페르소나
│  ├─ db/               Drizzle
│  ├─ ui/               디자인 시스템 (06 문서)
│  └─ types/
├─ tools/
│  ├─ content-gen/      Claude Code 워크플로 (04 문서)
│  ├─ content-verify/
│  └─ seed/
└─ turbo.json
```

### `packages/room-kit` 규칙

- 게임 모듈은 **`Date.now()` / `Math.random()` 금지** — 전부 주입
- 게임 모듈은 **WebSocket·DO를 모른다** — 순수 함수만
- `viewFor`는 **반드시 구현**, 정답 누출을 테스트가 검증

## 8. 성능

| 구간 | 목표 |
|---|---|
| 첫 화면 (FCP) | < 1.2s |
| 방 목록 로드 | < 200ms (KV) |
| 방 입장 → 화면 | < 500ms |
| **채팅 왕복 (p95)** | **< 150ms** |
| 정답 판정 → 전원 반영 | < 200ms |
| 라운드 전환 | < 300ms |

**채팅 왕복이 가장 중요하다.** 정답을 쳤는데 반영이 늦으면 게임이 느리게 느껴진다. DO 아시아 배치 + 최소 페이로드로 잡는다.

브로드캐스트 페이로드는 델타만 보낸다. 방 상태 전체는 입장·재접속 시에만.

## 9. 안티치트 · 필수 테스트

| 위협 | 방어 |
|---|---|
| 정답 미리 알기 | 정답은 DO에만. `viewFor`가 참가자별로 제거 |
| 단어 연상 정답 누출 | 출제자 뷰와 나머지 뷰를 분리. 테스트 필수 |
| 자동 정답 봇 | 응답 시간 분포 이상 탐지, Turnstile |
| 채팅 도배 | 초당 1건 + 쿨다운 |
| 시간 조작 | DO의 `Date.now()`가 기준. 클라 타임스탬프 무시 |
| 방 스팸 생성 | Turnstile + 계정당 동시 방 1개 |

### 필수 테스트

| 테스트 | 내용 | 중요도 |
|---|---|---|
| `game:view-leak` | `viewFor` 결과에 정답이 없는가 (출제자 제외) | 🔴 최우선 |
| `room:team-chat-isolation` | 팀 채널 메시지가 상대 팀 소켓에 안 가는가 | 🔴 최우선 |
| `room:chat-not-stored` | 채팅 100건 후 DO storage 미증가 | 🔴 |
| `ai:determinism` | 같은 시드 → 같은 AI 행동 계획 | 🟡 |
| `room:reconnect` | 60초 내 재접속 시 상태 복원 | 🟡 |
| `game:judge` | 정답 정규화 (`97`, `1997년`, 공백) | 🟡 |

## 10. 열려 있는 결정 사항

| # | 항목 | 비고 |
|---|---|---|
| T1 | 방 목록 폴링 vs LobbyDO WebSocket | 초기엔 폴링, 규모 커지면 WS |
| T2 | DO 요금 실측 | 방당 비용 확인 후 §8 갱신 |
| T3 | Postgres 호스팅 | Neon vs Hetzner |
| T4 | 관전자 수 상한 | DO 브로드캐스트 부하 |
| T5 | 콘텐츠 KV 분할 단위 | 값 크기 제한 확인 필요 |
| T6 | NestJS 배치 위치 | Containers vs 외부 (Phase 2) |
