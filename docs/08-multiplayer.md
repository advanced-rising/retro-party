# 08. 멀티플레이 아키텍처

> "서버가 필요하지 않나?" — 필요하다. 그리고 **이미 스택에 있다.**
> Durable Objects가 그 서버다. NestJS는 멀티플레이와 무관하다.

## 1. 역할 정리 — 오해 방지

| 컴포넌트 | 담당 | 상태 | 멀티플레이 |
|---|---|---|---|
| **Workers** | HTTP 요청 처리, 채점, 랭킹 조회 | 무상태 | 관계 없음 |
| **Durable Objects** | **방 상태 · WebSocket · 타이머** | 상태 보유 | ✅ **여기가 멀티플레이 서버** |
| **NestJS** | 콘텐츠 배치, 관리자, 오류 신고 | — | 관계 없음 (트래픽 경로 밖) |

앞선 문서에서 "MVP는 백엔드 서버 없이 돌아간다"고 쓴 것은 **NestJS를 안 띄운다**는 뜻이었다. 상태를 가진 서버가 없다는 뜻이 아니다.

## 2. 왜 Durable Objects인가

Durable Object는 **전역에 하나뿐인, 상태를 가진 단일 스레드 액터**다. 멀티플레이 방과 구조가 정확히 일치한다.

```
방 하나 = DO 인스턴스 하나
  ├─ 참가자 WebSocket 연결들
  ├─ 방 상태 (퍼즐, 각자 진행률, 남은 시간)
  ├─ 타이머 (alarm)
  └─ 스토리지 (재접속 대비)
```

| 항목 | Durable Objects | 전통적 상시 서버 (Node + WS) |
|---|---|---|
| 스케일링 | 방마다 인스턴스 → **자동 샤딩** | 인스턴스 수 관리 필요 |
| 상태 저장소 | DO 내부에 있음 | Redis 등 별도 필요 |
| 유휴 비용 | **Hibernation으로 거의 0** | 상시 과금 |
| Workers 연동 | 바인딩으로 직접 호출 | HTTP 왕복 |
| 배포 | `wrangler deploy` 하나 | 별도 인프라 |
| 로컬 개발 | 전통 서버보다 번거로움 | 편함 |
| 지역 지연 | 인스턴스 위치 고정 → 원거리 참가자 불리 | 마찬가지 |
| 벤더 락인 | 있음 | 없음 |

**우리 케이스에는 DO가 명확히 낫다:**
- 주 사용자가 한국 → 인스턴스를 아시아에 배치하면 지역 지연 문제가 사실상 없다
- 방당 2~8명, 초당 이벤트 몇 개 수준 → DO 처리량이 차고 넘친다
- 방 수명이 1~3분 → Hibernation으로 유휴 과금이 거의 안 붙는다

> ⚠️ 구현 전 확인: DO 요금 체계(요청 + 활성 duration), WebSocket Hibernation API 사용법, `locationHint`로 인스턴스 배치를 아시아로 고정하는 방법.

## 3. 우리 게임의 요구사항 — 생각보다 관대하다

「그 해」도 「맞춤법 지옥」도 **액션 게임이 아니다.** 60fps 동기화 같은 게 필요 없다.

| 게임 | 형태 | 동기화 대상 | 허용 지연 |
|---|---|---|---|
| 「그 해」 대전 | 동시 진행 | 상대의 시도 횟수, 정답 여부 | **0.5초** |
| 「맞춤법 지옥」 대전 | 동시 진행 | 상대 점수, 남은 시간 | **0.3초** |

**진짜 턴제(번갈아 두는)는 없다.** 둘 다 "동시에 각자 풀되 상대 진행률이 실시간으로 보이는" 형태다. 이게 훨씬 단순하고, 긴장감도 더 크다.

```
  ╔═══════════════════════════════════════════════╗
  ║  그 해 · 대전                        ⏱ 01:12  ║
  ╠═══════════════════════════════════════════════╣
  ║   나     ███░░░  3번째 시도                    ║
  ║   상대   ████░░  4번째 시도                    ║  ← 실시간
  ╠═══════════════════════════════════════════════╣
  ║   힌트 3   이 해 개봉 — 「접속」                ║
  ║   > _                                         ║
  ╚═══════════════════════════════════════════════╝
```

**상대의 추측 내용은 보여주지 않는다.** 몇 번째인지만 보여준다. 그래야 베끼기가 안 되고, 쫓기는 긴장감만 남는다.

## 4. ★ GameModule에 멀티 훅을 지금 넣는다

**이게 이 문서에서 가장 중요한 결정이다.**

멀티플레이는 Phase 3이지만, `GameModule` 인터페이스를 싱글 전용으로 확정해버리면 나중에 **모든 게임을 갈아엎어야 한다.** 지금 훅만 정의해두고 구현은 미룬다.

```ts
export interface GameModule<Puzzle, Submission, Result> {
  // ── 싱글 (필수) ──────────────────────────────
  createDaily(ctx, date, seed): Promise<Puzzle>
  validate(ctx, puzzle, sub): Promise<Result>
  redact(puzzle): PublicPuzzle
  Client: React.ComponentType<GameProps>

  // ── 멀티 (선택 — 지원하는 게임만) ─────────────
  multiplayer?: MultiplayerSpec<Puzzle, Submission>
}

export interface MultiplayerSpec<Puzzle, Submission> {
  maxPlayers: number                    // 「그 해」 2, 「맞춤법」 8
  durationMs: number | null             // 제한 시간, null = 무제한

  createMatch(ctx, seed, playerIds): MatchState<Puzzle>

  // ★ 순수 함수. WebSocket도 DO도 모른다.
  applyAction(
    state: MatchState<Puzzle>,
    playerId: string,
    action: Submission,
    atMs: number,
  ): MatchDelta

  isFinished(state: MatchState<Puzzle>): boolean
  rank(state: MatchState<Puzzle>): PlayerRank[]

  // 각 참가자에게 보낼 뷰 — 상대 정답이 새면 안 된다
  viewFor(state: MatchState<Puzzle>, playerId: string): PlayerView
}
```

### 관심사 분리

```
MatchRoom (DO)                    GameModule.multiplayer
─────────────────────            ──────────────────────
WebSocket 연결 관리        │      순수 상태 전이
브로드캐스트               │      승패 판정
타이머 (alarm)             │      순위 산출
재접속 처리                │      참가자별 뷰 생성
스토리지 영속화            │
                          │      ← 전송을 전혀 모른다
```

**`applyAction`이 순수 함수라는 게 핵심이다.** DO가 그냥 호출하면 되고, 게임 모듈은 네트워크를 몰라도 된다. 테스트도 쉽다 — DO 없이 단위 테스트가 가능하다.

`viewFor`는 `redact`의 멀티 버전이다. **참가자마다 다른 뷰를 만들어 상대 정보가 새지 않게 한다.**

## 5. MatchRoom Durable Object

```ts
export class MatchRoom {
  private state: MatchState<unknown>
  private game: MultiplayerSpec<unknown, unknown>

  async fetch(req: Request) {
    // WebSocket 업그레이드 → Hibernation API로 수락
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server, [playerId])   // 태그로 참가자 식별
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, msg: string) {
    const playerId = this.ctx.getTags(ws)[0]
    const action = JSON.parse(msg)

    const delta = this.game.applyAction(this.state, playerId, action, Date.now())
    this.state = apply(this.state, delta)
    await this.ctx.storage.put('state', this.state)

    // 참가자별로 다른 뷰를 보낸다
    for (const sock of this.ctx.getWebSockets()) {
      const pid = this.ctx.getTags(sock)[0]
      sock.send(JSON.stringify(this.game.viewFor(this.state, pid)))
    }

    if (this.game.isFinished(this.state)) await this.finish()
  }

  async alarm() {         // 제한 시간 만료
    await this.finish()
  }

  private async finish() {
    const ranks = this.game.rank(this.state)
    await recordMatchResult(this.env.DB, this.matchId, ranks)   // PG에 기록
    this.broadcast({ type: 'finished', ranks })
    for (const s of this.ctx.getWebSockets()) s.close(1000)
  }
}
```

### WebSocket Hibernation

`acceptWebSocket()`을 쓰면 **연결은 유지한 채 DO가 메모리에서 내려갈 수 있다.** 유휴 시간에 duration 과금이 안 붙는다. 대기실처럼 아무 일 없이 연결만 떠 있는 구간이 많은 게임에서 비용 차이가 크다.

**`webSocketMessage()` 진입 시 상태를 스토리지에서 복원해야 한다** — 메모리에 있다고 가정하면 hibernation 후 깨진다.

## 6. 채팅 — 전달만 하고 보관하지 않는다

PC통신 컨셉에 대화방이 없으면 섭섭하다. 그리고 **휘발이 요구사항이다.**

### 6.1 원칙: 서버는 릴레이일 뿐이다

```
플레이어 A ──메시지──▶ MatchRoom DO ──브로드캐스트──▶ 플레이어 B
                          │
                          └─ 저장하지 않는다
                             · storage.put() 호출 없음
                             · 메모리 버퍼도 두지 않음
                             · 로그에 본문을 남기지 않음
```

**가장 순수한 형태의 휘발이다.** DO는 받아서 즉시 던지고 잊는다.

부수 효과 세 가지:
1. **Hibernation과 충돌하지 않는다.** 상태가 없으니 메모리에서 내려가도 잃을 게 없다
2. **재접속하면 이전 대화가 안 보인다.** 이건 버그가 아니라 사양이다 — 화면에 명시한다
3. **유출 사고가 구조적으로 불가능하다.** 없는 데이터는 새지 않는다

### 6.2 화면

```
  ╔═══════════════════════════════════════════════╗
  ║  그 해 · 대전                        ⏱ 01:12  ║
  ╠═══════════════════════════════════════════════╣
  ║   나     ███░░░  3번째 시도                    ║
  ║   상대   ████░░  4번째 시도                    ║
  ╠═══════════════════════════════════════════════╣
  ║   힌트 3   이 해 개봉 — 「접속」                ║
  ║   > _                                         ║
  ╠═══ 대 화 방 ══════════════════════════════════╣
  ║   상대 > 이거 90년대 후반인건 알겠는데          ║
  ║   나   > ㅋㅋ 저도요                           ║
  ║   상대 > 아 접속 나왔네                        ║
  ║                                               ║
  ║   > _                    ※ 대화는 저장되지 않습니다 ║
  ╚═══════════════════════════════════════════════╝
```

- 하단 고정. 게임 입력창과 **Tab으로 전환**
- `※ 대화는 저장되지 않습니다` 를 항상 노출한다. 유저가 알고 쓰게 한다
- 방이 끝나면 대화창째로 사라진다

### 6.3 저장 없이 안전을 확보하는 법

저장을 안 하면 사후 조치가 어렵다. **실시간 방어와 신고 시점 수집으로 메운다.**

| 위협 | 대응 | 저장 여부 |
|---|---|---|
| 욕설 · 혐오 | 서버 실시간 금칙어 필터. **통과/차단 판정만 하고 원문은 버린다** | ✕ |
| 도배 · 스팸 | 초당 1건, 연속 3건 후 3초 쿨다운 | ✕ |
| 개인정보 유도 | URL · 전화번호 · 계좌번호 패턴 자동 마스킹 | ✕ |
| 신고 | **신고자 클라이언트가 직전 20개를 첨부해 전송** | ⚠️ 신고 건만 |
| 낯선 사람 리스크 | **랜덤 매칭은 자유 채팅 금지** (§6.4) | — |

**신고 첨부 방식이 핵심이다.** 평시에는 아무것도 저장하지 않고, 신고가 들어온 그 순간에만 신고자 화면에 남아 있던 대화를 받는다.

```
신고 버튼
  → 클라이언트가 자기 화면의 직전 20줄을 첨부해 전송
  → 서버가 그때 처음으로 저장 (reports 테이블)
  → 검토 후 30일 보관, 이후 자동 삭제
```

한계도 분명하다: **신고자가 조작할 수 있다.** 그래서 첨부된 대화는 증거가 아니라 **검토 시작점**으로만 쓴다. 실제 제재는 반복 신고 누적·필터 차단 이력 같은 서버 측 신호로 판단한다.

### 6.4 랜덤 매칭에서는 자유 채팅을 열지 않는다

낯선 사람과의 자유 채팅은 리스크 대비 이득이 작다.

| 모드 | 채팅 |
|---|---|
| **친구 초대 대전** | ✅ 자유 채팅 (서로 아는 사이) |
| **랜덤 매칭** | ❌ 자유 채팅 없음. **정형 이모트만** |

정형 이모트는 PC통신 감성으로:

```
  [1] 안녕하세요      [2] 잘 부탁드립니다
  [3] 오!             [4] 아깝다
  [5] 대단하시네요     [6] 수고하셨습니다
```

숫자 키로 전송. 이것도 저장하지 않는다. **필요한 사교성은 다 되면서 사고가 날 여지가 없다.**

### 6.5 구현

```ts
async webSocketMessage(ws: WebSocket, msg: string) {
  const playerId = this.ctx.getTags(ws)[0]
  const parsed = JSON.parse(msg)

  if (parsed.type === 'chat') {
    // ── 저장하지 않는 경로 ──
    if (!this.rateLimiter.allow(playerId)) return          // 도배 차단
    const clean = sanitize(parsed.text)                     // 필터 + 마스킹
    if (clean === null) {
      ws.send(JSON.stringify({ type: 'chat_blocked' }))     // 원문 버림
      return
    }
    this.broadcast({ type: 'chat', from: playerId, text: clean })
    return                                                   // ★ storage.put() 없음
  }

  // 게임 액션은 기존 경로 (상태 저장 있음)
  const delta = this.game.applyAction(this.state, playerId, parsed, Date.now())
  // ...
}
```

**`chat` 분기에서 `storage.put()`을 호출하지 않는 것**이 전부다. 코드로 보장하고, 테스트로 검증한다.

```
test: 채팅 100건을 보낸 뒤 DO storage 크기가 변하지 않는다
```

### 6.6 로깅 주의

무심코 새기 쉬운 곳이 로그다.

- **채팅 본문을 로그·에러 리포트·분석 이벤트에 절대 넣지 않는다**
- Sentry 등에 예외가 올라갈 때 메시지 본문이 payload에 실리지 않는지 확인
- 집계는 **건수만** (`chat_sent`, `chat_blocked` 카운터). 내용은 안 본다

## 7. 매칭

두 단계로 나눈다. **친구 대전이 먼저다.**

### 7.1 친구 초대 (Phase 3 전반)

```
방 만들기 → matchId 발급 → 초대 링크 공유
  → 상대가 링크로 입장 → 둘 다 준비 → 시작
```

**매칭 로직이 필요 없다.** DO 하나만 있으면 된다. 그리고 데일리 게임의 실제 사용 맥락(단톡방에서 "야 이거 해봐")과도 맞다.

`matchId`는 6자리 코드로. `idFromName(matchId)`로 DO를 특정한다.

### 7.2 랜덤 매칭 (Phase 3 후반 ~ 4)

```
Lobby DO (게임별 1개)
  ├─ 대기열
  ├─ 2명 모이면 matchId 생성 → MatchRoom DO 스폰
  └─ 양쪽에 matchId 통지
```

Lobby는 게임별로 하나면 충분하다. 유저가 늘면 지역/등급별로 샤딩한다.

**랜덤 매칭은 동시 접속자가 충분해야 성립한다.** MAU 6만 정도는 돼야 대기 시간이 견딜 만해진다 — Phase 3 후반으로 잡은 이유다.

## 8. 안티치트

싱글과 원칙이 같다: **정답은 서버에만 있다.**

| 위협 | 방어 |
|---|---|
| 정답 미리 알기 | `viewFor`가 참가자별로 정답 제거. DO만 정답 보유 |
| 상대 추측 훔쳐보기 | 진행률만 브로드캐스트. 추측 내용은 안 보냄 |
| 시간 조작 | DO의 `Date.now()`가 기준. 클라 타임스탬프 무시 |
| 봇 | 액션 최소 간격, Turnstile (방 입장 시) |
| 승부 조작 (지인끼리 점수 몰아주기) | **친구 대전은 랭킹 비집계.** 랜덤 매칭만 집계 |
| 연결 끊고 도망 | 이탈 시 패배 처리. 재접속 유예 30초 |

마지막 두 줄이 중요하다. 친구 대전을 랭킹에 넣으면 첫날 무너진다.

## 9. 재접속

모바일에서 앱을 잠깐 나갔다 오는 건 흔하다. 이걸 패배로 처리하면 아무도 안 한다.

```
연결 끊김
  → DO는 상태 유지, 30초 타이머 시작
  → 재접속: 같은 matchId + playerId 토큰으로 입장
     → 현재 상태 전체를 재전송 (viewFor)
  → 30초 초과: 해당 참가자 기권 처리
```

`playerId` 토큰은 방 입장 시 서명해서 발급한다. 이게 없으면 남의 자리에 들어갈 수 있다.

## 10. 비용

방 하나(2명, 3분) 기준 개략:

| 항목 | 추정 |
|---|---|
| DO 요청 | 액션 ~20회 + 연결 2 |
| DO 활성 duration | Hibernation 적용 시 실제 처리 시간만 |
| WebSocket 메시지 | 양방향 ~80건 |

**일 1,000경기 규모에서도 월 몇 달러 수준**으로 예상된다. 대전이 데일리의 보조 모드라 물량이 크지 않다.

> 구현 전 DO 요금 체계를 실제로 확인하고 이 추정을 갱신한다.

## 11. 도입 시점 — 그리고 의견

| Phase | 작업 |
|---|---|
| **2** | `MultiplayerSpec` 인터페이스 **정의만**. 구현 없음 |
| **3 전반** | MatchRoom DO + 친구 초대 대전 (「그 해」) |
| **3 후반** | 「맞춤법 지옥」 대전 (동시형 검증) |
| **4** | 랜덤 매칭, 관전, 시즌 대전 랭킹 |

### 멀티를 앞당길 것인가

**앞당기지 않기를 권합니다.** 이유:

1. **데일리 게임의 정체성은 혼자 하는 것이다.** 「그 해」는 아침에 혼자 풀고 결과를 공유하는 리듬이고, 그게 Wordle이 증명한 구조다. 멀티를 MVP에 넣으면 초점이 흐려진다.
2. **멀티는 동시 접속자가 있어야 재밌다.** MVP 시점엔 사람이 없어서 빈 대기실만 보게 된다.
3. **공유 카드가 이미 비동기 멀티다.** "나 3번 만에 맞혔는데 너는?"이 사실상 대전이고, 이게 훨씬 싸고 확산력도 크다.

**대신 Phase 2에서 인터페이스는 반드시 확정한다.** 그러면 Phase 3에 게임 로직을 안 건드리고 붙일 수 있다. 지금 필요한 건 구현이 아니라 **자리를 비워두는 것**이다.

> 물론 대전이 핵심 기획이라면 Phase 2로 앞당길 수 있습니다. 그 경우 「그 해」 친구 대전만 먼저 붙이는 게 현실적입니다 — 매칭 로직이 없어서 DO 하나로 끝납니다.

## 12. 열려 있는 결정 사항

| # | 항목 | 비고 |
|---|---|---|
| M1 | 멀티 도입 시점 | Phase 3 vs 2. §10 |
| M2 | DO 요금 실측 | §9 추정 갱신 |
| M3 | DO 배치 지역 고정 방법 | `locationHint` 아시아 |
| M4 | 친구 대전 랭킹 집계 여부 | 현재 비집계 방침 (§7) |
| M5 | 관전 모드 | 방에 read-only 참가자 허용할지 |
| M6 | 이탈 유예 30초가 적절한가 | 모바일 실측 필요 |
