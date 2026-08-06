# 03. 기술 아키텍처

> 확정 스택: **Cloudflare + PostgreSQL + Next.js + NestJS**.
> 게임을 계속 얹어갈 수 있는 **모듈 플러그인 구조**가 이 문서의 핵심이다.

## 1. 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트엔드 | **Next.js 15 (App Router) + TypeScript** on Cloudflare Workers (`@opennextjs/cloudflare`) | SSR, 공유 카드 OG 이미지, 엣지 배포 |
| 플랫폼 API | **Cloudflare Workers** (Hono) | 데일리 발급·채점·랭킹. 가볍고 빠름 |
| 실시간/상태 | **Durable Objects** | 랭킹 집계, 세션, 향후 대전 |
| 백엔드 | **NestJS** | **콘텐츠 파이프라인**, 검증, 관리자, 배치 |
| DB | **PostgreSQL** (Neon 또는 Hetzner) + **Hyperdrive** | 힌트 DB가 본체. Supabase 미사용 |
| ORM | **Drizzle ORM** | Workers 런타임 호환 |
| 캐시 | **Workers KV** | 오늘의 퍼즐, 설정 |
| 오브젝트 | **R2** | 공유 이미지, 에셋 |
| 큐/배치 | **Queues** + **Cron Triggers** | 데일리 생성, 난이도 보정 |
| 봇 방어 | **Turnstile** + Rate Limiting | 랭킹 어뷰징 |
| 분석 | **Workers Analytics Engine** | 힌트별 정답률 (고카디널리티) |
| 모노레포 | pnpm workspace + Turborepo | |

## 2. 시스템 구성

```
┌─ Cloudflare Edge ─────────────────────────────────────────────┐
│  ┌──────────────────┐   ┌──────────────────────────────────┐  │
│  │ Worker: web      │   │ Worker: platform-api             │  │
│  │ Next.js/OpenNext │   │  · 오늘의 퍼즐 발급               │  │
│  │ PC통신 셸 · SSR  │   │  · 추측 채점                     │  │
│  │ 공유 카드 OG     │   │  · 점수 제출 · 랭킹              │  │
│  └──────────────────┘   └────────────┬─────────────────────┘  │
│                                       │                        │
│  ┌────────────────────────────────────▼──────────────────────┐│
│  │ Durable Objects                                            ││
│  │  Leaderboard   일간/주간 랭킹 (게임별 샤딩)                ││
│  │  DailyPuzzle   오늘의 퍼즐 캐시 + 통계 집계                ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  KV(퍼즐·설정)   R2(이미지)   Queues   Cron   Turnstile        │
└────────────────────────────────┬──────────────────────────────┘
                                 │ Hyperdrive
                    ┌────────────▼─────────────┐
                    │  PostgreSQL              │
                    │  facts · hints           │  ← 콘텐츠 (02 문서)
                    │  users · plays · scores  │  ← 플랫폼
                    │  daily_puzzles · streaks │
                    └────────────▲─────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │  NestJS                  │
                    │  · 콘텐츠 파이프라인 ★   │
                    │  · Claude API 생성/검증  │
                    │  · 공공 API 대조         │
                    │  · 난이도 자가보정 배치   │
                    │  · 관리자 대시보드       │
                    └──────────────────────────┘
```

### 2.1 NestJS의 자리 — Phase 2부터

**Phase 0~1에는 NestJS가 필요 없다.** 콘텐츠를 Claude Code로 만들기 때문이다 (02 문서 §3.0).

```
Phase 0~1   Claude Code → data/facts/*.json → validate.mjs → seed.mjs → PG
            NestJS 없음. 스크립트 3개면 끝난다.

Phase 2+    관리자 UI, 오류 신고 처리, 난이도 보정 배치가 쌓이면 NestJS 도입
            (API 파이프라인으로 전환한다면 그것도 여기)
```

**MVP에서 백엔드 서버를 안 띄워도 된다는 뜻이다.** Workers + PG만으로 게임이 돌아간다.
아래 구조는 Phase 2 이후의 최종형이다.

**NestJS는 사용자 트래픽 경로 밖에 있다.** 플레이어 요청은 Workers에서 완결된다.

| 컴포넌트 | 담당 | 지연 요구 |
|---|---|---|
| **Workers** | 퍼즐 발급, 채점, 랭킹 — 플레이 경로 전부 | < 80ms |
| **NestJS** | 콘텐츠 생성·검증, 배치, 관리자 | 느려도 됨 (밤새 돌아도 무방) |

NestJS는 Cloudflare Workers에서 직접 돌리기 어렵다 (Node HTTP 어댑터 전제, 번들 크기, 콜드스타트). 배치 위치는 두 안:

| 안 | 장점 | 단점 |
|---|---|---|
| **A. Cloudflare Containers** | CF 생태계 단일화, Hyperdrive 바인딩 | 요금·가용성 확인 필요 |
| **B. 외부 호스팅** (Fly.io / Railway / Hetzner) | 검증됨, 저렴, 자유도 | 인프라 2곳 |

**콘텐츠 파이프라인은 장시간 배치 작업**(Claude Batch API 폴링, 수천 건 검증)이라 컨테이너 환경이 자연스럽다. A를 우선 검토하되, 조건이 안 맞으면 즉시 B로 간다. 어느 쪽이든 게임 플레이에는 영향이 없다.

> ⚠️ 착수 전 확인: Cloudflare Containers의 가용성·요금·장시간 실행 제약.

## 3. ★ 게임 모듈 플러그인 구조

플랫폼의 수명을 결정하는 부분이다. **새 게임 추가가 파일 몇 개**여야 한다.

### 3.1 인터페이스

```ts
// packages/game-kit/src/types.ts
export interface GameModule<Puzzle, Submission, Result> {
  id: string                    // 'geuhae' | 'spelling' | ...
  meta: {
    name: string                // '그 해'
    order: number               // PC통신 메뉴 번호
    estimatedSeconds: number
    status: 'live' | 'coming-soon'
  }

  // ── 서버 전용 ────────────────────────────────
  createDaily(ctx: GameCtx, date: string, seed: string): Promise<Puzzle>
  validate(ctx: GameCtx, puzzle: Puzzle, sub: Submission): Promise<Result>
  score(result: Result): number
  redact(puzzle: Puzzle): PublicPuzzle    // 정답을 뺀 클라이언트용

  // ── 클라이언트 ───────────────────────────────
  Client: React.ComponentType<GameProps<PublicPuzzle, Submission>>
  ShareCard: (result: Result) => ShareCardData
}
```

### 3.2 플랫폼이 제공하는 것

```ts
interface GameCtx {
  db: Database          // Drizzle
  kv: KVNamespace
  now: Date             // 주입 — 게임 모듈은 Date.now() 금지
  rng: (n: number) => number   // 시드 기반 결정적 PRNG
}
```

**게임 모듈에서 `Date.now()`와 `Math.random()`을 금지한다.** 전부 주입받는다. 그래야 같은 시드로 같은 퍼즐이 재현되고, 테스트가 가능하다.

### 3.3 새 게임 추가 절차

```
packages/games/spelling/
├─ index.ts        GameModule 구현
├─ client.tsx      게임 화면
├─ share.ts        공유 카드
└─ schema.ts       게임별 payload 타입

apps/web/lib/registry.ts 에 한 줄 추가
```

라우팅(`/g/spelling`), 계정, 랭킹, 스트릭, 공유 — 전부 플랫폼이 자동으로 붙인다.

### 3.4 「그 해」의 구현

```ts
// packages/games/geuhae/index.ts
export const geuhae: GameModule<YearPuzzle, YearGuess, YearResult> = {
  id: 'geuhae',
  meta: { name: '그 해', order: 1, estimatedSeconds: 150, status: 'live' },

  async createDaily(ctx, date, seed) {
    const year = pickYear(ctx, seed)              // 90일 내 미출제 연도에서
    const hints = await pickHints(ctx, year, seed) // T5→T1 순으로 6개
    return { year, hints }
  },

  async validate(ctx, puzzle, guess) {
    const correct = guess.year === puzzle.year
    const diff = guess.year - puzzle.year
    return {
      correct,
      direction: diff > 0 ? 'past' : diff < 0 ? 'future' : null,
      temperature: tempOf(Math.abs(diff)),        // 🔥🔥 / 🔥 / · / ❄ / ❄❄
      attemptsUsed: guess.attempt,
    }
  },

  redact: (p) => ({ hints: p.hints.map(h => h.text) }),  // year 제거
  // ...
}
```

**`redact()`가 안티치트의 핵심이다** (§4).

## 4. 안티치트 — 정답을 클라이언트에 주지 않는다

데일리 게임에서 정답이 클라이언트에 있으면 첫날 SNS에 퍼진다.

```
GET  /api/g/geuhae/today
  → { puzzleId, hints: ["자장면 한 그릇 2,500원"] }    ← 힌트 1개만. 정답 없음

POST /api/g/geuhae/guess   { puzzleId, year: 1997 }
  → 서버가 DB에서 정답 조회 → 판정
  → { correct: false, direction: "past", temperature: "cold",
      nextHint: "이 해 데뷔한 그룹 — H.O.T" }          ← 다음 힌트 동봉

POST /api/g/geuhae/finish
  → 점수 확정 → 랭킹 반영 → 정답 + 「그 해」 카드 데이터 반환
```

- **힌트는 틀릴 때마다 하나씩 서버가 내려준다.** 미리 전부 주지 않는다
- 정답 연도는 게임이 끝난 뒤에만 응답에 실린다
- 시도 횟수를 서버가 소유. 클라이언트 카운터는 표시용

### 추가 방어

| 위협 | 방어 |
|---|---|
| 이분탐색 봇 | 추측 간 최소 간격, Turnstile, 이상 패턴 플래그 |
| 다중 계정 | 데일리는 계정당 1런. 게스트는 랭킹 비집계 |
| 정답 스포일링 | 공유 카드에 정답 미포함 (01 문서 §5.1) |
| 시각 조작 | 서버가 KST 기준 날짜 판정 |
| 퍼즐 사전 유출 | 데일리 퍼즐은 00:00 KST Cron에서 생성. 그 전엔 존재하지 않음 |

## 5. 데일리 퍼즐 생성

```
매일 00:00 KST — Cron Trigger
  ↓
게임별로 createDaily(ctx, date, seed) 호출
  seed = hash(WORLD_SEED ‖ gameId ‖ date)
  ↓
DB에 daily_puzzles 로 저장 (정답 포함)
KV에 redact() 결과 캐시 (정답 제외)
  ↓
Durable Object 초기화 (통계 집계용)
```

**KV에는 정답이 없는 버전만 넣는다.** 엣지에서 빠르게 서빙하면서도 정답은 DB에만 있다.

### 연도 선정 규칙

```
후보 = 전체 연도
     − 최근 90일 내 출제된 연도
     − 힌트 풀이 12개 미만인 연도

가중치: 최근 출제일이 오래될수록 ↑
       nostalgia 평균이 높을수록 ↑
```

## 6. 데이터 모델 (플랫폼)

콘텐츠 스키마(`facts`, `hints`)는 02 문서에. 여기는 플랫폼 공통.

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  provider      TEXT,                    -- kakao|google|guest
  provider_uid  TEXT,
  nickname      TEXT,
  birth_decade  SMALLINT,                -- 세대 비교용 (선택 입력)
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE daily_puzzles (
  game_id       TEXT NOT NULL,
  date          DATE NOT NULL,
  seed          TEXT NOT NULL,
  payload       JSONB NOT NULL,          -- 게임별 (정답 포함)
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (game_id, date)
);

CREATE TABLE plays (
  id            UUID PRIMARY KEY,
  game_id       TEXT NOT NULL,
  user_id       UUID REFERENCES users(id),   -- NULL = 게스트
  date          DATE,                        -- 데일리만
  mode          TEXT NOT NULL,               -- daily|free|pack
  submissions   JSONB,                       -- 시도 로그
  result        JSONB,
  score         INTEGER,
  finished_at   TIMESTAMPTZ,
  UNIQUE (game_id, user_id, date)            -- 데일리 1인 1회
);
CREATE INDEX ON plays (game_id, date, score DESC);

CREATE TABLE streaks (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  current       INTEGER DEFAULT 0,
  best          INTEGER DEFAULT 0,
  last_played   DATE
);

CREATE TABLE leaderboard_snapshots (
  game_id       TEXT,
  scope         TEXT,                        -- daily:2026-08-06 | weekly:2026-W32
  rank          INTEGER,
  user_id       UUID,
  score         INTEGER,
  PRIMARY KEY (game_id, scope, rank)
);
```

**게임별 데이터는 전부 `payload`/`result` JSONB에 넣는다.** 새 게임을 추가할 때 스키마 마이그레이션이 필요 없다 — 플러그인 구조의 실질적 조건이다.

실시간 랭킹은 Durable Object에서, 확정된 일일 순위만 PG에 스냅샷.

## 7. 모노레포 구조

```
retronet/
├─ apps/
│  ├─ web/              Next.js 15 (Workers, OpenNext)
│  ├─ platform-api/     Cloudflare Worker (Hono) + Durable Objects
│  └─ content-api/      NestJS — 파이프라인 · 관리자
├─ packages/
│  ├─ game-kit/         ★ GameModule 인터페이스, 공통 타입, 시드 PRNG
│  ├─ games/
│  │  ├─ geuhae/        「그 해」
│  │  ├─ spelling/      「맞춤법 지옥」 (Phase 2)
│  │  └─ jeonguk/       「전국구」 (Phase 3)
│  ├─ db/               Drizzle 스키마 + 마이그레이션
│  ├─ ui/               터미널 컴포넌트 (Frame, Prompt, Gauge…)
│  └─ types/
├─ tools/
│  ├─ content-gen/      Claude 생성 스크립트
│  ├─ content-verify/   공공 API 대조 · 교차검증
│  └─ seed/             로컬 개발용 샘플 데이터
└─ turbo.json
```

### `packages/game-kit` 규칙

- 게임 모듈은 **`Date.now()` / `Math.random()` 금지** — `ctx`에서 주입
- 게임 모듈은 **DB 스키마를 직접 알지 못한다** — `ctx.db`의 좁은 인터페이스만
- `redact()`는 **반드시 구현**해야 하고, 정답이 새는지 테스트가 검증한다

## 8. 성능 예산

| 구간 | 목표 |
|---|---|
| 첫 화면(FCP) | < 1.0s (접속 연출이 가려줌) |
| 오늘의 퍼즐 조회 | < 50ms (KV) |
| 추측 채점 왕복 | < 100ms |
| 「그 해」 카드 조회 | < 150ms |
| 랭킹 조회 | < 50ms (DO) |
| 공유 이미지 생성 | < 500ms (R2 캐시) |

**게임 플레이 중 DB 접근은 채점 시 1회뿐**이다. 힌트와 퍼즐은 KV에서 나온다.

## 9. 개발 환경

```bash
pnpm i
pnpm db:up            # docker compose: postgres
pnpm db:migrate
pnpm seed             # 샘플 힌트 200건 (실제 파이프라인 없이 개발 가능)
pnpm dev              # wrangler dev + next dev
```

**신규 인원이 Claude API 키 없이도 로컬에서 게임을 돌릴 수 있어야 한다.** 샘플 시드가 그 조건이다.

### 필수 테스트

| 테스트 | 내용 | 중요도 |
|---|---|---|
| `game:redact` | `redact()`가 정답을 완전히 제거하는가 | 🔴 |
| `game:determinism` | 같은 시드 → 같은 퍼즐 | 🔴 |
| `content:schema` | 힌트가 25자 이내, 연도 미언급 | 🟡 |
| `platform:daily-once` | 데일리 1인 1회가 강제되는가 | 🟡 |

`redact` 테스트가 최우선이다. 이게 뚫리면 데일리 게임이 무너진다.

## 10. 배포

| 앱 | 배포 |
|---|---|
| web | Cloudflare Workers (`opennextjs-cloudflare deploy`) |
| platform-api | Cloudflare Workers (`wrangler deploy`) |
| content-api | Containers 또는 Fly.io (Docker) |
| DB | Neon / Hetzner, 마이그레이션은 CI |

CI: GitHub Actions. `main` 머지 → 테스트 → 스테이징 → 수동 승인 → 프로덕션.

**콘텐츠 변경은 코드 배포와 분리한다.** 힌트 추가·수정은 DB 작업이고, 배포가 필요 없다.

## 11. 열려 있는 결정 사항

| # | 항목 | 비고 |
|---|---|---|
| T1 | NestJS 배치 위치 | Containers vs 외부. §2.1 |
| T2 | Postgres 호스팅 | Neon(서버리스) vs Hetzner(저렴) |
| T3 | 공유 이미지 렌더링 | Workers에서 Satori(도트 폰트 확인) vs R2 사전 생성 |
| T4 | 게스트 플레이 범위 | 데일리 허용 vs 프리 모드만 |
| T5 | 랭킹 DO 샤딩 | 유저 증가 시 단일 DO는 쓰기 병목 |
