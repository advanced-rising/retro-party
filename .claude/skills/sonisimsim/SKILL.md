---
name: sonisimsim
description: 손이심심(sonisimsim) 레포 — 90년대 소재 실시간 방 파티 게임에서 코드나 문서를 작성·수정할 때 반드시 먼저 읽는다. 게임방·채팅·팀전·랭크·콘텐츠 파이프라인·UI 어느 쪽이든 해당한다. 어기면 제품이 조용히 깨지는 규약(참가자는 전부 실제 사람, 이모지 금지, 런타임 LLM 호출 금지, 채팅 무저장, 정답 누출 방지, 팀 채널 격리, 컬러 토큰)과 문서 지도를 담고 있다.
---

# 손이심심 작업 규약

방에 8명이 들어가 90년대 소재 퀴즈를 풀며 **채팅으로 답을 외치는** 실시간 게임.
큐플레이·캐치마인드·쿵쿵따 계보. 게임 서버는 Cloudflare Durable Objects.

기획 문서는 `docs/` 에 11개, 약 4,000줄. **전부 읽지 말고 아래 지도로 필요한 것만 연다.**

---

## 1. 절대 규칙 — 어기면 제품이 깨진다

각 항목은 실제로 위반하기 쉽고, 위반해도 **에러 없이 조용히 망가진다.**

### 1.1 참가자를 만들어내지 않는다

**봇·AI·더미 참가자는 존재하지 않는다.** 방의 모든 참가자는 실제 WebSocket 연결과 1:1로 대응한다.
`Participant` 는 단일 인터페이스이고, 종류를 가르는 필드가 없다 — 그게 이 규칙을 타입으로 박은 것이다.

인원이 모자랄 때의 정답은 **채워 넣는 것이 아니라 모으는 것**이다.

```
2명이면 시작한다        나머지는 진행 중에 난입시킨다 (03 문서 §5)
팀전 홀수면 한 명이 쉰다  다음 판 배정에서 맨 앞으로 (01 문서 §6.5.1)
방을 흩뿌리지 않는다      사람 수 내림차순 정렬 · 빈 방 미노출 (03 문서 §4)
```

> 대기 인원·방 인원 표시도 마찬가지다. **실제 접속자 수만 센다.**
> 숫자를 부풀리는 코드가 들어가는 순간 이 제품의 신뢰가 끝난다.
> 03 문서 전체

### 1.2 런타임에 LLM을 호출하지 않는다

방에서 벌어지는 모든 일은 **사전 생성된 자산과 순수 로직**으로 돌아간다.
단어 연상 혼자 모드도 **사전 생성된 3단계 스크립트**를 시간에 따라 흘릴 뿐이다.

> 이걸 어기면 방 지연이 LLM 응답 시간에 묶이고 동접당 비용이 선형으로 늘어난다.
> 04 문서 §5.5.2

### 1.3 UI에 이모지를 쓰지 않는다

아바타 · 순위 · 상태 · 이모트 전부 **아이콘(Lucide/Phosphor) 또는 텍스트**다.

```
아바타   Phosphor Fill 아이콘 + 배경색   (90년대 물건 우선: cassette-tape, floppy-disk …)
출제자   아바타 테두리를 --purple 로 (단어 연상)
이모트   순수 텍스트                     잘한다 / 헐 / ㅋㅋㅋ / 아깝다 / 음… / ㅎㅇ
순위     crown · medal 아이콘 + 숫자
```

> 이모지는 OS마다 다르게 렌더되고 **색을 통제할 수 없다.** 팀 색·출제자 보라 같은 시맨틱 컬러를 못 입힌다.
> 06 문서 §4.2~4.4

### 1.4 채팅을 저장하지 않는다

`RoomDO` 의 chat 분기에서 **`storage.put()` 을 호출하지 않는다.** 메모리 버퍼도 두지 않는다.
로그·Sentry·분석 이벤트에 **본문을 넣지 않는다** (건수 카운터만).

```
test: room:chat-not-stored — 채팅 100건 후 DO storage 크기 미증가
```

> 08 문서 §11

### 1.4 팀 채널이 새면 팀전이 통째로 무너진다

팀 채팅은 **같은 팀 소켓에만** 브로드캐스트한다. WebSocket 태그에 팀 번호를 넣고 필터한다.
정답 판정도 **팀 채널에서만** 한다 — 전체 채널에 답을 쳐도 점수가 들어가면 안 된다.

```
test: room:team-chat-isolation
```

> 01 문서 §6.5.2 · 05 문서 §3.2

### 1.5 `viewFor` 가 정답을 흘리면 안 된다

참가자별 뷰를 만드는 유일한 통로다. 단어 연상에서 **출제자만** 정답을 알아야 하고,
팀전에서는 **상대 팀 출제자의 단어**도 가려야 한다.

```
test: game:view-leak  ← 최우선
```

> 01 문서 §9 · 05 문서 §3.3

### 1.6 게임 모듈에서 `Date.now()` / `Math.random()` 금지

전부 `ctx` 로 주입받는다. 게임 모듈은 **순수 함수**이고 WebSocket·DO를 몰라야 한다.
같은 시드 → 같은 문제가 재현되지 않으면 데일리와 랭크전이 성립하지 않는다.

### 1.7 정답 원문은 맞힌 사람에게만 간다

채팅이 곧 정답 입력이라, 먼저 맞힌 사람의 줄을 그대로 브로드캐스트하면
나머지가 그걸 베낀다. **판정이 correct 인 줄은 이미 맞힌 사람에게만 원문이 가고,
나머지는 `***` 를 본다.** 「맞혔다」는 사실만 공유하고 답은 공유하지 않는다.

```
room-kit/engine.ts   Effect.chat.revealTo — 원문을 볼 수 있는 사람
                     lineFor(effect, viewer) — 이걸 안 거치면 샌다
test: 먼저 맞힌 사람의 답이 나머지에게 그대로 보이면 안 된다
```

### 1.8 문항은 검증을 통과한 것만 넣는다

```bash
pnpm content          형식 검증. 실패하면 exit 1
pnpm content --stats  주제별 분포
```

기계가 잡는 것은 형식뿐이다 — 정답이 힌트에 들어갔는지, 초성이 나오는지,
주제 안에서 중복인지, 물가에 근거(`source`)가 있는지.
**사실이 맞는지는 기계가 모른다.** 그건 사람 검수와 게임 안 신고 버튼 몫이다
(신고는 Discord 웹훅으로 간다 — 주소는 서버에만 둔다).

### 1.9 인원 표시는 실제 숫자만 쓴다

방 인원 · 대기열 인원 · "지금 N명이 있어요" 배너. 전부 **살아 있는 연결 수**다.
반올림도, 최소값 보정도, "N명 이상" 같은 완충 표기도 넣지 않는다.

```
test: room:no-synthetic-players — 참가자 수 == 열린 소켓 수
```

> 03 문서 §3.4 · §4.4

### 1.10 랭크전은 매칭 큐로만 입장한다

방 코드 입장을 허용하면 지인끼리 점수를 몰아줄 수 있다. 랭크전은 **개인전 고정**,
Lv20 이상. 4명이 안 모이면 매칭되지 않고 그냥 기다린다.

> 10 문서 §3.3 · §6

---

## 2. 컬러 토큰

**다크 기본 + 라이트 정식 지원.** 액센트는 테마에 따라 명도가 뒤집히고 그 위 글자색도 같이 뒤집힌다.
**라이트에는 네온이 없다.**

```css
:root {                        /* 라이트 */
  --bg-base:#F7F8FA; --bg-surface:#FFFFFF; --bg-elevated:#EFF1F5;
  --border:#E3E7EC; --border-hi:#CFD5DE;
  --text-hi:#12151A; --text:#3A4049; --text-lo:#586070; --text-dim:#646C7A;
  --lime:#1B7A10; --on-lime:#FFFFFF; --lime-wash:#E8FADF;
  --blue:#1D4ED8; --red:#BE1C1C; --amber:#9A4C07; --gold:#7A5A0F; --purple:#6D28D9;
  --avatar-bg:#5F6874;          /* 이니셜 흰색 */
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg-base:#0D0F14; --bg-surface:#161A22; --bg-elevated:#1E232D;
    --border:#252A34; --border-hi:#3D4757;
    --text-hi:#F2F4F8; --text:#C6CCD6; --text-lo:#8E96A4; --text-dim:#828B99;
    --lime:#7CFF6B; --on-lime:#07240A; --lime-wash:#1D3320;
    --blue:#7FB4FF; --red:#FF7A7A; --amber:#FFC470; --gold:#FFDD7A; --purple:#C4A3FF;
    --avatar-bg:#7C8798;        /* 이니셜 #0B0C0F */
  }
}
:root[data-theme="dark"]{ /* dark 와 동일 */ }
:root[data-theme="light"]{ /* :root 기본과 동일 */ }
```

**지킬 것**

- 컴포넌트는 **토큰만 참조**한다. 미디어 쿼리 안에서 컴포넌트를 스타일링하지 않는다
- **`--text-dim` 보다 흐린 글자를 만들지 않는다.** 네 단계가 회색 텍스트의 전부이고 dim 이 AA 하한선이다.
  더 흐리게 하고 싶으면 **크기·굵기**로 위계를 만든다
- **라임은 세 자리에만** — 타이머 바 · 정답 하이라이트 · 주 버튼. 네 번째 자리가 필요해지면 다른 토큰을 만든다
- **라이트에서 그림자를 쓰지 않는다.** 카드 구분은 `--border` 1px. 다크는 그림자, 라이트는 선
- **색만으로 정보를 전달하지 않는다.** 정답 = `--lime` + `check-circle` + `+100`

**토큰을 바꾸면 반드시 검증한다**

```bash
pnpm contrast     # 32건. 실패 시 exit 1
```

> 06 문서 §2

---

## 2.5 모션 — Motion (motion.dev)

**`motion.div` 가 아니라 `m.div` 를 쓴다.** 앱이 `LazyMotion` 으로 감싸져 있어서
(`components/MotionRoot.tsx`) 섞어 쓰면 번들 이득이 사라진다.

```
lib/motion.ts   스프링·이징 프리셋. 컴포넌트마다 손으로 적지 않는다
```

### 지키는 것

| | |
|---|---|
| **GPU 속성만** | transform · opacity · filter. width/height/top 은 매 프레임 레이아웃을 다시 계산한다. 게이지도 width 가 아니라 **scaleX + transformOrigin** |
| **reduced-motion 을 JS 에서** | globals.css 규칙은 CSS 만 막는다. Motion 은 인라인 스타일이라 `useMotionOk()` 로 꺼야 한다 |
| **가만히 있는 건 안 움직인다** | 무한 반복 펄스를 여러 곳에 두면 화면이 울렁거려 읽히지 않는다. 모션은 **상태가 바뀌는 순간**에만 |
| **값을 굴리지 않는다** | 점수를 스프링으로 굴리면 숫자가 흔들려 안 읽힌다. 값은 즉시 바뀌고 오른 사실만 한 번 튄다 |
| **blur 남발 금지** | 흐물거려 보이고 합성 비용도 크다 |

**가장 효과가 큰 자리**: 참가자 목록의 `layout`(FLIP). 점수 순 정렬이라 누가 맞히면
순위가 실제로 밀린다 — 그 순간이 이 게임에서 제일 통쾌하다.

---

## 3. TypeScript — 타입은 필수다

**모든 코드는 TypeScript.** `tsconfig.base.json` 을 상속하고, `strict` 만으로 부족한 것까지 켜져 있다.

```
noUncheckedIndexedAccess      arr[0] 은 T | undefined 다
exactOptionalPropertyTypes    ?: T 에 undefined 를 못 넣는다
noPropertyAccessFromIndexSignature   raw.type 대신 raw['type']
noImplicitReturns · noFallthroughCasesInSwitch
verbatimModuleSyntax          타입 import 는 `import type`
```

### 금지

| 금지 | 대신 |
|---|---|
| `any` | `unknown` + 타입 가드 |
| `as` 캐스팅 | 타입 가드 · 파서. **예외: 브랜디드 생성자(`asRoomId`)와 파서 내부뿐** |
| `@ts-ignore` | `@ts-expect-error` + 사유 주석. 그것도 최후수단 |
| 암묵적 `any` 파라미터 | 전부 명시 |
| 신뢰 없는 입력을 타입 단언으로 받기 | `parseClientMessage()` 같은 **런타임 파서**를 통과시킨다 |

### 규약

- **브랜디드 ID를 쓴다.** `RoomId` / `PlayerId` / `MatchId` 는 전부 string 이지만 교환 불가다.
  섞이는 사고를 컴파일 타임에 막는다 — `packages/types/src/ids.ts`
- **상태·이벤트는 discriminated union.** `{ kind: 'lobby' } | { kind: 'playing'; roundNo: number }`
  switch 에서 exhaustive 검사가 걸린다
- **`readonly` 를 기본으로.** 게임 모듈이 순수 함수여야 하는 규칙(§1.6)과 맞물린다
- **공개 API 는 반환 타입을 명시**한다. 추론에 맡기면 리팩터링 때 조용히 바뀐다
- **import 에 `.ts` 확장자를 붙인다.** Node 24 `--experimental-strip-types` 로 빌드 없이 실행하기 위한 것
  (`allowImportingTsExtensions` + `emitDeclarationOnly`)

```bash
pnpm typecheck      # tsc --build. 실패하면 머지 금지
pnpm test           # node:test. 게임 모듈과 방 엔진은 테스트가 있어야 한다
```

### 검증할 수 없는 곳에 로직을 두지 않는다

React 훅이나 DO 클래스 안에 판단 로직을 넣으면 아무도 테스트하지 못한다.
그래서 이 레포는 로직을 항상 순수 함수로 빼서 노드에서 돌린다.

```
방 상태 전이      room-kit/engine.ts        ← RoomDO 가 아니라 여기
서버 메시지 접기   room-kit/client-state.ts  ← useRoomSocket 이 아니라 여기
게임 규칙         games/{id}/index.ts
```

`RoomDO` 는 소켓만, 훅은 연결만 담당한다.

---

## 4. 게임 모듈 인터페이스

새 게임은 `packages/games/{id}/` 에 파일 4개 + 레지스트리 한 줄. **DB 마이그레이션 없음.**

실제 정의는 `packages/room-kit/src/game.ts`.

```ts
export interface RoomGame<Question, View> {
  readonly id: GameId
  readonly meta: GameMeta

  createRound(input: CreateRoundInput): Question
  judge(input: JudgeInput<Question>): Judgement
  isRoundOver(question: Question, round: RoundState): boolean
  reveal(question: Question): RevealData
  viewFor(input: ViewInput<Question>): View   // ★ 정답 누출 방지
}
```

- 인자를 **객체 하나로** 받는다. 파라미터가 늘어도 호출부가 안 깨진다
- 시간(`atMs` · `nowMs`)과 난수(`rng`)는 **전부 주입**된다 — §1.6
- `judge` 가 **채팅 원문을 그대로 받는다** — "채팅이 곧 정답 입력"이 인터페이스에 드러나 있다
- `Judgement` 는 `ignored | wrong | partial | correct` discriminated union.
  `ignored` 는 정답 후보가 아닌 잡담이고, 채팅에는 그대로 흐른다

새 게임 체크리스트는 09 문서 §6.3.

---

## 5. 문서 지도

| 무엇을 할 때 | 어디를 |
|---|---|
| 방 구조 · 모드 · 팀전 · 채팅 | **01** 코어 루프 |
| 게임 3종 규칙 (그 해 / 초성 / 단어 연상) | **02** 게임 |
| **빈 방 문제 · 프라임타임 · 뭉치기 · 난입** | **03** 콜드스타트 ← 이 프로젝트 최대 리스크 |
| 힌트·단어 DB 생성/검증 | **04** 콘텐츠 파이프라인 |
| DO · WebSocket · 스키마 · 테스트 | **05** 기술 아키텍처 |
| 컬러 · 타이포 · 아이콘 · 화면 | **06** 비주얼 |
| Phase · 관문 · 비용 | **07** 로드맵 |
| 채팅·사실오류·등급분류 | **08** 법무 |
| 4번째 이후 게임 | **09** 게임 확장 |
| 레벨 · 칭호 · 랭크 | **10** 진행 시스템 |

---

## 6. 판단이 필요할 때

문서에 없는 결정을 마주치면 **이 세 기준으로** 판단한다.

1. **빈 방을 보여주는가?** 이 장르는 콜드스타트로 죽는다. 사람이 없어 보이는 화면을 만들지 않는다
2. **채팅이 죽는가?** 채팅량이 이 게임의 재미이자 입력 장치다. 채팅을 줄이는 선택은 대체로 틀렸다
3. **하위권이 나갈 이유를 만드는가?** 꼴찌도 점수·레벨·칭호를 얻어야 한다

각 문서 마지막 절의 **열려 있는 결정 사항** 표에 미해결 항목이 정리돼 있다.
새로 결정한 게 있으면 그 표를 갱신한다.
