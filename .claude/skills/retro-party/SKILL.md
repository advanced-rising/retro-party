---
name: retro-party
description: retro-party 레포(90년대 소재 실시간 방 파티 게임)에서 코드나 문서를 작성·수정할 때 반드시 먼저 읽는다. 게임방·채팅·AI 참가자·팀전·랭크·콘텐츠 파이프라인·UI 어느 쪽이든 해당한다. 어기면 제품이 조용히 깨지는 규약(이모지 금지, 런타임 LLM 호출 금지, 채팅 무저장, 정답 누출 방지, 팀 채널 격리, 컬러 토큰)과 문서 지도를 담고 있다.
---

# retro-party 작업 규약

방에 8명이 들어가 90년대 소재 퀴즈를 풀며 **채팅으로 답을 외치는** 실시간 게임.
큐플레이·캐치마인드·쿵쿵따 계보. 게임 서버는 Cloudflare Durable Objects.

기획 문서는 `docs/` 에 11개, 약 4,000줄. **전부 읽지 말고 아래 지도로 필요한 것만 연다.**

---

## 1. 절대 규칙 — 어기면 제품이 깨진다

각 항목은 실제로 위반하기 쉽고, 위반해도 **에러 없이 조용히 망가진다.**

### 1.1 런타임에 LLM을 호출하지 않는다

AI 참가자도 예외가 아니다. 채팅 문구는 **사전 생성된 풀**에서 뽑고, 단어 연상 AI 출제자는
**사전 생성된 3단계 스크립트**를 시간에 따라 흘린다.

> 이걸 어기면 방 지연이 LLM 응답 시간에 묶이고 동접당 비용이 선형으로 늘어난다.
> 04 문서 §5.5.2 · 03 문서 §3.4

### 1.2 UI에 이모지를 쓰지 않는다

아바타 · 순위 · 상태 · 이모트 전부 **아이콘(Lucide/Phosphor) 또는 텍스트**다.

```
아바타   Phosphor Fill 아이콘 + 배경색   (90년대 물건 우선: cassette-tape, floppy-disk …)
AI       robot 아이콘 + --purple 고정
이모트   순수 텍스트                     잘한다 / 헐 / ㅋㅋㅋ / 아깝다 / 음… / ㅎㅇ
순위     crown · medal 아이콘 + 숫자
```

> 이모지는 OS마다 다르게 렌더되고 **색을 통제할 수 없다.** 팀 색·AI 보라 같은 시맨틱 컬러를 못 입힌다.
> 06 문서 §4.2~4.4

### 1.3 채팅을 저장하지 않는다

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

### 1.7 AI 참가자를 숨기지 않는다

`robot` 아이콘 + `--purple` + 닉네임 앞 표시. **라이트 테마에서 보라가 어두워져야 한다** —
안 그러면 흰 배경에서 AI 닉네임이 안 읽히고 이 원칙이 렌더링에서 조용히 깨진다.

> 03 문서 §3.1

### 1.8 랭크전은 매칭 큐로만 입장한다

방 코드 입장을 허용하면 지인끼리 점수를 몰아줄 수 있다. 랭크전은 **개인전 고정**,
AI 참가자 **없음**, Lv20 이상.

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
node tools/contrast.mjs     # 32건. 실패 시 exit 1
```

> 06 문서 §2

---

## 3. 게임 모듈 인터페이스

새 게임은 `packages/games/{id}/` 에 파일 4개 + 레지스트리 한 줄. **DB 마이그레이션 없음.**

```ts
export interface RoomGame<Question, Answer> {
  id: string
  meta: { name; minPlayers; maxPlayers; roundMs; hasPresenter }

  // 순수 함수 — WebSocket·DO를 모른다
  createRound(seed: string, roundNo: number, ctx: ContentCtx): Question
  judge(q: Question, playerId: string, text: string, atMs: number): Judgement
  isRoundOver(q: Question, state: RoundState): boolean
  reveal(q: Question): RevealData
  viewFor(q, state, playerId): PlayerView   // ★ 정답 누출 방지

  Board: React.ComponentType<BoardProps>
}
```

`judge` 가 **채팅 메시지를 그대로 받는다** — "채팅이 곧 정답 입력"이 인터페이스에 드러나 있다.

새 게임 체크리스트는 09 문서 §6.3.

---

## 4. 문서 지도

| 무엇을 할 때 | 어디를 |
|---|---|
| 방 구조 · 모드 · 팀전 · 채팅 | **01** 코어 루프 |
| 게임 3종 규칙 (그 해 / 초성 / 단어 연상) | **02** 게임 |
| **빈 방 문제 · AI 참가자 · 프라임타임** | **03** 콜드스타트 ← 이 프로젝트 최대 리스크 |
| 힌트·단어 DB 생성/검증 | **04** 콘텐츠 파이프라인 |
| DO · WebSocket · 스키마 · 테스트 | **05** 기술 아키텍처 |
| 컬러 · 타이포 · 아이콘 · 화면 | **06** 비주얼 |
| Phase · 관문 · 비용 | **07** 로드맵 |
| 채팅·사실오류·등급분류 | **08** 법무 |
| 4번째 이후 게임 | **09** 게임 확장 |
| 레벨 · 칭호 · 랭크 | **10** 진행 시스템 |

---

## 5. 판단이 필요할 때

문서에 없는 결정을 마주치면 **이 세 기준으로** 판단한다.

1. **빈 방을 보여주는가?** 이 장르는 콜드스타트로 죽는다. 사람이 없어 보이는 화면을 만들지 않는다
2. **채팅이 죽는가?** 채팅량이 이 게임의 재미이자 입력 장치다. 채팅을 줄이는 선택은 대체로 틀렸다
3. **하위권이 나갈 이유를 만드는가?** 꼴찌도 점수·레벨·칭호를 얻어야 한다

각 문서 마지막 절의 **열려 있는 결정 사항** 표에 미해결 항목이 정리돼 있다.
새로 결정한 게 있으면 그 표를 갱신한다.
