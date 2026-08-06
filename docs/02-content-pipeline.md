# 02. 콘텐츠 파이프라인 — 힌트 데이터 대량 구축

> AI와 웹검색으로 연도별 사실을 대량 생성해 DB에 적재하고, 게임은 그 DB만 읽는다.
> **런타임에 LLM을 호출하지 않는다.** 게임 응답 속도와 비용, 그리고 무엇보다 정확성 때문이다.
>
> 이 문서의 절반은 생성이 아니라 **검증**이다. 그 비율이 옳다.

## 1. 목표 규모

| 항목 | 수치 |
|---|---|
| 대상 연도 | 1960 ~ 현재 (66개) |
| 카테고리 | 10종 (01 문서 §2.1) |
| 연도당 목표 힌트 | 60개 이상 |
| **최종 적재 목표** | **약 4,000건** |
| 생성 후보 (검증 통과율 55% 가정) | 약 8,000건 |
| 초기 구축 기간 | 2~3주 (검수 포함) |

4,000건이면 데일리 기준 **2~3년치** 콘텐츠다 (01 문서 §7).

## 2. 파이프라인 개요

```
① 수집 계획        연도 × 카테고리 매트릭스 660셀
        ↓
② 생성             Claude + 웹검색 → 후보 사실 + 출처 URL
        ↓
③ 검증 (3티어)     ★ 파이프라인의 본체
   ├ Tier A 수치형  공공 API 자동 대조 → 정답 존재
   ├ Tier B 사건형  독립 소스 2개 교차 확인
   └ Tier C 문화형  사람 검수 or 톤 완화
        ↓
④ 가공             25자 힌트 문장 + 난이도 티어 + 태그
        ↓
⑤ 적재             PostgreSQL + 출처 URL 보관
        ↓
⑥ 운영             플레이 데이터로 난이도 자가보정 · 오류 신고 처리
```

## 3. ② 생성

### 3.1 모델과 도구

| 항목 | 선택 | 근거 |
|---|---|---|
| 모델 | **`claude-opus-5`** | 사실 정확도가 곧 제품 품질. 여기서 아끼면 검증 비용이 더 든다 |
| 웹검색 | `web_search_20260209` | 동적 필터링 내장 — 검색 결과를 컨텍스트에 넣기 전에 걸러줌 |
| 웹페치 | `web_fetch_20260209` | 출처 원문 확인용 |
| 출력 | **구조화 출력** (`output_config.format`) | JSON 스키마 강제. 파싱 실패가 없다 |
| 사고 | `thinking: {type: "adaptive"}` + `effort: "high"` | 연도 정확성은 신중함이 필요한 작업 |

> ⚠️ 웹검색 서버 도구를 **Batch API에서 쓸 수 있는지 착수 전 확인**해야 한다. 안 되면 생성 단계는 일반 요청으로, 검증 단계만 배치로 돌린다 (비용 §6 참조).

### 3.2 요청 단위

**1요청 = 1셀 (연도 × 카테고리)**. 셀당 후보 12~15건을 한 번에 뽑는다.

```
연도 1997 × 카테고리 "물가·생활비"
  → 자장면, 지하철 기본요금, 라면, 담배, 시내버스,
     최저임금, 소주, 신문 구독료, 목욕탕, 극장 관람료 …
```

셀 단위로 쪼개는 이유:
- 프롬프트 캐싱이 먹는다 (§3.4)
- 한 셀이 실패해도 나머지가 안 죽는다
- 카테고리별로 검증 티어가 다르다 (§4)

### 3.3 출력 스키마

구조화 출력으로 강제한다. 파싱 실패나 형식 붕괴가 원천 차단된다.

```json
{
  "type": "object",
  "properties": {
    "facts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "claim":       { "type": "string", "description": "사실 한 문장. 연도 언급 금지" },
          "value":       { "type": "string", "description": "수치가 있으면 숫자+단위" },
          "category":    { "type": "string", "enum": ["price","culture","tech","news","sports","slang","product","broadcast","stat","ad"] },
          "verify_tier": { "type": "string", "enum": ["A","B","C"] },
          "sources":     { "type": "array", "items": { "type": "string" }, "minItems": 1 },
          "confidence":  { "type": "string", "enum": ["high","medium","low"] },
          "nostalgia":   { "type": "integer", "minimum": 1, "maximum": 5, "description": "'아 맞다!' 지수" }
        },
        "required": ["claim","category","verify_tier","sources","confidence","nostalgia"]
      }
    }
  },
  "required": ["facts"],
  "additionalProperties": false
}
```

**`sources`를 필수로 잡는 게 핵심이다.** 출처를 못 대는 사실은 애초에 생성되지 않게 만든다.

`nostalgia` 점수는 재미 필터다. 01 문서 §2.4의 "아 맞다! 소리가 나오는가"를 모델에게 직접 매기게 하고, 낮은 건 T5로 강등하거나 버린다.

### 3.4 프롬프트 캐싱

660개 요청이 **동일한 지시문 프리픽스**를 공유한다. 캐싱 없이 돌리면 그 부분을 660번 전액 지불한다.

```
[캐시 구간] 시스템 프롬프트 — 작성 규칙, 카테고리 정의, 좋은/나쁜 예시
            ↑ cache_control: {"type": "ephemeral", "ttl": "1h"}
[가변 구간] "1997년의 물가·생활비 항목을 뽑아라"
```

- 캐시 읽기는 약 0.1배, 쓰기는 1시간 TTL 기준 2배
- 660연속 요청이면 사실상 전부 읽기 → **지시문 비용이 1/10로**
- 지시문을 넉넉히 길게 써도 부담이 없다는 뜻이다. 예시를 아끼지 않는다

캐시가 먹으려면 프리픽스가 **바이트 단위로 동일**해야 한다. 시스템 프롬프트에 날짜나 UUID를 절대 끼워 넣지 않는다.

> 최소 캐시 길이: `claude-opus-5`는 512토큰. 지시문이 그보다 짧으면 캐싱이 조용히 안 먹는다 — 검증 시 `cache_read_input_tokens`가 0이 아닌지 확인한다.

### 3.5 배치 API

콘텐츠 생성은 **지연에 전혀 민감하지 않다.** 밤에 돌려놓고 아침에 받으면 된다.

- Message Batches API: **모든 토큰 비용 50% 할인**
- 배치당 최대 10만 요청 / 256MB — 660건은 한 배치에 다 들어간다
- 대부분 1시간 내 완료, 최대 24시간
- 결과는 `custom_id`로 키잉 (**순서 보장 없음** — 인덱스로 매칭하면 안 된다)

`custom_id` 규칙: `gen-{year}-{category}` — 재실행 시 멱등하게 매칭된다.

## 4. ③ 검증 — 파이프라인의 본체

### 4.1 왜 검증이 절반인가

**LLM은 연도를 틀린다.** 특히 "X는 몇 년에 출시됐나" 같은 질문에서. 그런데 이 게임은 연도 정확성이 전부다. 틀린 힌트 하나가 커뮤니티에 박제되면 신뢰가 끝난다.

그래서 **생성물을 그대로 믿지 않는 것**이 이 파이프라인의 기본 전제다.

### 4.2 Tier A — 수치형 (자동 검증 100%)

정답이 공공 API에 존재하는 항목. **사람 손이 전혀 안 간다.**

| 항목 | 소스 | 비고 |
|---|---|---|
| 소비자물가 품목별 가격 (자장면, 라면, 소주…) | 통계청 KOSIS | 공공데이터, API 제공 |
| 최저임금 | 최저임금위원회 | 연도별 공표값 |
| 환율 / 기준금리 | 한국은행 ECOS | API |
| 인구 / 출생아 수 | 통계청 | API |
| 지하철·버스 요금 | 서울시 열린데이터광장 | |

```
생성된 값  ↔  공공 API 조회값
  일치 (±2% 이내)  → 통과, confidence=high
  불일치           → 격리. API 값으로 자동 교정 후 재검토
  API에 없음       → Tier B로 강등
```

**Tier A는 사실상 API가 정답을 만들고 LLM은 "어떤 항목을 뽑을지"만 고르는 구조다.** 이게 가장 안전하고, 가장 재미있는 힌트가 나오는 카테고리이기도 하다.

### 4.3 Tier B — 사건형 (교차 검증)

영화 개봉, 그룹 데뷔, 제품 출시, 사건.

```
① 생성 세션과 완전히 분리된 새 요청으로 검증
   "다음 진술이 사실인지, 연도가 맞는지 독립적으로 확인하라: {claim}"
   웹검색 도구 사용, 출처 URL 필수 반환

② 원 생성물의 sources 와 검증 결과의 sources 를 비교
   - 독립 소스 2개 이상에서 동일 연도 확인 → 통과
   - 연도 불일치                          → 격리
   - 소스 1개뿐                           → confidence=medium, 사람 검수 큐
```

**같은 세션에서 자기가 만든 걸 자기가 검증하게 하면 안 된다.** 확증편향이 그대로 재현된다. 별도 요청, 별도 프롬프트, 생성 결과의 근거를 보여주지 않고 백지에서 확인시킨다.

검증 단계는 **웹검색 비중이 낮고 요청이 짧다** → `claude-sonnet-5`로 내려도 되는지 실측 후 판단. 초기엔 Opus로 안전하게 간다.

### 4.4 Tier C — 문화형 (사람 검수 또는 톤 완화)

유행어, 인기 상품, 광고 카피, "그때 다들 그랬다" 류.

이건 **객관적 정답이 없다.** 두 가지로 처리한다.

1. **톤 완화** — 단정하지 않는다
   - ❌ `이 해 유행어 — "야타족"`
   - ✅ `이 무렵 유행하던 말 — "야타족"`
2. **사람 검수** — 세대 감각이 있는 사람이 봐야 한다. 전량 검수가 원칙이나, 초기엔 `nostalgia ≥ 4`인 것부터

Tier C는 전체의 20%를 넘기지 않는다. 재미는 크지만 리스크도 크다.

### 4.5 품질 게이트

배포 전 **무작위 200건 샘플을 사람이 전수 검수**한다.

| 지표 | 기준 |
|---|---|
| 사실 오류율 | **< 1%** |
| 연도 오류율 | **< 0.5%** ← 가장 치명적 |
| 출처 유효율 (링크 생존) | > 90% |
| 중복률 | < 3% |

**연도 오류 0.5%를 못 넘기면 배포하지 않는다.** 4,000건 중 20건 이상이 틀렸다는 뜻이고, 그 정도면 유저가 반드시 발견한다.

## 5. ④ 가공 — 힌트 카드로

검증 통과한 사실을 게임 힌트로 다듬는다.

```
사실:  "1997년 자장면 한 그릇 평균 가격은 2,500원이었다" (출처: KOSIS)
  ↓
힌트:  "자장면 한 그릇 2,500원"          ← 25자 이내, 연도 언급 없음
       category: price
       tier: 3 (초기 추정값)
       generations: [30대, 40대, 50대]  ← 이 힌트가 통하는 세대
```

### 티어 초기 추정

**이 힌트만으로 연도를 얼마나 좁힐 수 있는가**를 기준으로 매긴다. 초기값은 대충 매겨도 된다 — 플레이 데이터가 알아서 교정한다 (01 문서 §8).

| 티어 | 특정 범위 |
|---|---|
| T5 | 10년 이상 |
| T4 | 약 5년 |
| T3 | 2~3년 |
| T2 | 거의 특정 |
| T1 | 그 해에만 |

## 6. 비용 추정

토큰 단가는 `claude-opus-5` 기준 입력 $5 / 출력 $25 (100만 토큰당).

### 초기 구축 (1회)

| 단계 | 요청 수 | 요청당 토큰 (입/출) | 소계 |
|---|---|---|---|
| 생성 (웹검색 포함) | 660 | 20K / 3K | ~$115 |
| ↳ 프롬프트 캐싱 적용 | | | ~$95 |
| ↳ 배치 API 50% (가능 시) | | | **~$48** |
| Tier B 검증 (웹검색) | ~3,000 | 8K / 0.5K | ~$160 |
| ↳ 캐싱 + 배치 | | | **~$65** |
| 재생성 / 보정 (20% 여유) | | | ~$25 |
| **합계** | | | **약 $140** |

**초기 콘텐츠 구축에 20만 원이 안 든다.** 사람이 4,000건을 조사해서 쓰는 것과 비교하면 압도적이다.

> 웹검색 도구 자체의 과금이 별도로 붙는지 착수 전 확인. 위 추정은 토큰 비용만 계산했다.

### 운영 (월)

| 항목 | 비용 |
|---|---|
| 신규 연도 추가 (연 1회) | ~$3 |
| 오류 신고 재검증 | ~$5 |
| 힌트 풀 보강 (분기 1회, 500건) | ~$20 → 월 환산 ~$7 |
| **합계** | **월 ~$12** |

**런타임에는 LLM을 전혀 호출하지 않으므로 유저가 늘어도 이 비용은 안 늘어난다.**

## 7. 저작권

- **사실에는 저작권이 없다.** "1997년 자장면 2,500원"은 사실이다
- 언론 기사 문장을 그대로 복제하지 않는다. 사실을 추출해 **자체 문장으로 재작성**
- `sources`는 **참조 링크**로만 보관. 인용이 아니다
- 웹페치로 가져온 원문은 **검증 과정에만 사용**하고 DB에 저장하지 않는다
- 공공데이터(KOSIS, ECOS, 열린데이터광장)는 이용 조건이 명시돼 있다 — 출처 표기 준수

자세한 내용은 07 문서.

## 8. 스키마

```sql
-- 검증을 통과한 사실 (원자료)
CREATE TABLE facts (
  id            BIGSERIAL PRIMARY KEY,
  year          SMALLINT NOT NULL,
  category      TEXT NOT NULL,
  claim         TEXT NOT NULL,
  value_text    TEXT,
  value_num     NUMERIC,
  verify_tier   CHAR(1) NOT NULL,          -- A|B|C
  verified_at   TIMESTAMPTZ,
  verified_by   TEXT,                       -- api:kosis | llm:crosscheck | human:{id}
  confidence    TEXT,
  nostalgia     SMALLINT,
  sources       JSONB NOT NULL,             -- [{url, fetched_at, kind}]
  gen_model     TEXT,                       -- claude-opus-5
  gen_batch_id  TEXT,
  status        TEXT DEFAULT 'active',      -- active|quarantined|retired
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON facts (year, category) WHERE status = 'active';

-- 게임에 노출되는 힌트 카드
CREATE TABLE hints (
  id            BIGSERIAL PRIMARY KEY,
  fact_id       BIGINT REFERENCES facts(id),
  year          SMALLINT NOT NULL,
  text          TEXT NOT NULL,              -- 25자 이내
  category      TEXT NOT NULL,
  tier          SMALLINT NOT NULL,          -- 1~5, 배치로 자가보정
  tier_source   TEXT DEFAULT 'estimated',   -- estimated|measured
  generations   SMALLINT[],                 -- 통하는 세대
  shown_count   INTEGER DEFAULT 0,
  solved_after  INTEGER DEFAULT 0,          -- 이 힌트 직후 정답 수
  status        TEXT DEFAULT 'active',
  UNIQUE (year, text)
);
CREATE INDEX ON hints (year, tier) WHERE status = 'active';

-- 격리 (검증 실패)
CREATE TABLE quarantine (
  id            BIGSERIAL PRIMARY KEY,
  raw_json      JSONB NOT NULL,
  reason        TEXT NOT NULL,              -- year_mismatch|no_source|api_conflict|duplicate
  detected_at   TIMESTAMPTZ DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolution    TEXT                        -- corrected|discarded|promoted
);

-- 오류 신고
CREATE TABLE hint_reports (
  id            BIGSERIAL PRIMARY KEY,
  hint_id       BIGINT REFERENCES hints(id),
  user_id       UUID,
  reason        TEXT,
  detail        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  handled_at    TIMESTAMPTZ,
  outcome       TEXT                        -- fixed|invalid|duplicate
);
```

**격리 테이블이 중요하다.** 검증 실패한 것을 버리지 않고 쌓아두면, 나중에 "우리 생성기가 어떤 종류의 실수를 하는지"가 데이터로 남는다.

## 9. ⑥ 운영

### 9.1 난이도 자가보정 (매일 배치)

```
각 힌트별로
  정답률 = solved_after / shown_count

  60%↑ → T1     40~60% → T2     20~40% → T3
  8~20% → T4    8%↓   → T5

  tier_source = 'measured' 로 전환
  초기 추정값과 2단계 이상 차이나면 플래그 → 검토
```

**힌트가 쌓일수록 밸런싱이 정확해진다.** 사람이 감으로 매긴 초기 티어는 그저 부트스트랩일 뿐이다.

### 9.2 오류 신고

게임 내 힌트마다 신고 버튼. 신고가 들어오면:

1. 해당 힌트 **즉시 비활성화** (`status = 'suspended'`) — 확인 전에 먼저 내린다
2. 자동 재검증 트리거 (Tier A는 API 재조회, Tier B는 교차검증 재실행)
3. 24시간 내 처리, 결과를 신고자에게 통지
4. 확정 오류는 수정 이력을 공개 페이지에 남긴다

**"먼저 내리고 나중에 확인한다"가 원칙이다.** 틀린 힌트가 하루 더 노출되는 비용이, 맞는 힌트가 하루 빠지는 비용보다 훨씬 크다.

### 9.3 정기 보강

분기 1회, 정답률 분포를 보고 부족한 구간을 채운다.

- T1/T2 힌트가 부족한 연도 → 결정적 사실을 더 캐야 함
- 특정 세대만 아는 힌트에 편중된 연도 → 카테고리 다변화
- 최근 연도 (데이터가 얇음) → 우선 보강

## 10. 열려 있는 결정 사항

| # | 항목 | 비고 |
|---|---|---|
| P1 | 웹검색 서버 도구가 Batch API에서 동작하는가 | 안 되면 생성은 일반 요청, 검증만 배치 |
| P2 | 웹검색 도구의 별도 과금 여부 | §6 추정치에 미반영 |
| P3 | Tier B 검증을 Sonnet 5로 내릴 수 있는가 | 실측 후 판단. 비용 절반 |
| P4 | Tier C 사람 검수를 누가 하는가 | 세대 감각 필요. 외주 vs 직접 |
| P5 | 1960년대까지 갈 것인가 | 데이터도 얇고 아는 사람도 적음. 1980~ 시작이 안전할 수도 |
| P6 | 힌트 중복 판정 기준 | 같은 사실의 다른 표현을 어떻게 잡을지 (임베딩 유사도?) |
