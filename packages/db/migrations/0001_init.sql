-- 손이심심 — 초기 스키마
--
-- 05 문서 §6 의 설계를 그대로 옮기되 두 가지가 다르다.
--   · AI 참가자 칼럼을 뺐다. 참가자는 전부 실제 사람이다
--   · 채팅 로그 테이블이 없다. 저장하지 않는다 (08 문서 §11)
--
-- 이 DB 는 **실시간 경로에 없다.** 판이 시작할 때와 끝날 때만 쓴다 —
-- 라운드가 도는 동안에는 Durable Object 메모리에서만 논다.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  -- guest 는 계정 없이 브라우저에만 있는 사람. 나중에 연결할 수 있다
  provider      TEXT NOT NULL DEFAULT 'guest',
  provider_uid  TEXT,
  nickname      TEXT NOT NULL,
  avatar        TEXT,
  -- 세대 통계용. 선택 입력이라 NULL 이 정상이다
  birth_decade  SMALLINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

-- 게스트로 놀다가 계정을 만들면 이 표로 옛 기록을 잇는다.
-- 브라우저가 들고 있던 playerId 를 사람에 매단다
CREATE TABLE IF NOT EXISTS user_devices (
  device_id     TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_devices_user ON user_devices (user_id);

CREATE TABLE IF NOT EXISTS matches (
  id            UUID PRIMARY KEY,
  room_code     TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  mode          TEXT NOT NULL,
  team_size     SMALLINT,
  rounds        SMALLINT NOT NULL,
  player_count  SMALLINT NOT NULL,
  topics        TEXT[] NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_ended ON matches (ended_at DESC);
CREATE INDEX IF NOT EXISTS matches_game ON matches (game_id, ended_at DESC);

CREATE TABLE IF NOT EXISTS match_players (
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  -- 게스트는 NULL. 계정을 만들면 그때 채워진다
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id       TEXT NOT NULL,
  nickname        TEXT NOT NULL,
  team            SMALLINT,
  score           INTEGER NOT NULL,
  rank            SMALLINT NOT NULL,
  correct_count   SMALLINT NOT NULL DEFAULT 0,
  wrong_count     SMALLINT NOT NULL DEFAULT 0,
  first_answer_ms INTEGER,
  xp_gained       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, device_id)
);
CREATE INDEX IF NOT EXISTS match_players_user ON match_players (user_id);
CREATE INDEX IF NOT EXISTS match_players_device ON match_players (device_id);

-- 레벨 · 경험치 — 10 문서 §1
-- ★ 지금은 브라우저에만 쌓이고 있다. 이 표가 그걸 대체한다
CREATE TABLE IF NOT EXISTS user_progress (
  device_id     TEXT PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  xp            BIGINT NOT NULL DEFAULT 0,
  -- xp 에서 파생되지만 조회를 빠르게 하려고 함께 둔다
  level         SMALLINT NOT NULL DEFAULT 1,
  matches       INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  total_score   BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_progress_level ON user_progress (level DESC, xp DESC);

-- 하루 한 번만 되는 것들 (데일리 싱글) — 10 문서 §4
CREATE TABLE IF NOT EXISTS daily_plays (
  device_id     TEXT NOT NULL,
  played_on     DATE NOT NULL,
  game_id       TEXT NOT NULL,
  score         INTEGER NOT NULL DEFAULT 0,
  solved        SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, played_on, game_id)
);

-- 문항 신고 — Discord 로도 가지만, 모아 보려면 여기도 필요하다
CREATE TABLE IF NOT EXISTS content_reports (
  id            BIGSERIAL PRIMARY KEY,
  game_id       TEXT NOT NULL,
  topic         TEXT,
  reason        TEXT NOT NULL,
  subject       TEXT NOT NULL,
  detail        TEXT,
  room_code     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS content_reports_open
  ON content_reports (created_at DESC) WHERE resolved_at IS NULL;
