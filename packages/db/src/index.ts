import { levelFromXp } from '@retro/room-kit'

/**
 * Postgres 접근 계층 — 05 문서 §6
 *
 * ## 이 DB 는 실시간 경로에 없다
 *
 * 라운드가 도는 동안에는 한 번도 안 부른다. 방 상태는 Durable Object 메모리에
 * 있고, 여기는 **판이 시작할 때와 끝날 때만** 쓴다.
 *
 * 그래서 DB 가 잠깐 죽어도 진행 중인 판은 멀쩡하다. 그렇게 만들어야 한다 —
 * 채팅 왕복이 DB 지연에 묶이면 게임이 성립하지 않는다 (p95 150ms 예산).
 *
 * ## DB 가 없어도 돌아간다
 *
 * 로컬 개발과 초기 배포에서는 Hyperdrive 바인딩이 없을 수 있다.
 * 그때는 모든 함수가 조용히 no-op 이 된다 — 기록이 안 남을 뿐 게임은 돈다.
 * 기록을 못 남긴다고 판을 멈추는 건 우선순위가 거꾸로다.
 */

/** postgres 드라이버의 최소 모양. 드라이버 전체를 타입으로 끌어오지 않는다 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T[]>
}

export interface Progress {
  readonly deviceId: string
  readonly xp: number
  readonly level: number
  readonly matches: number
  readonly wins: number
  readonly totalScore: number
}

export const emptyProgress = (deviceId: string): Progress => ({
  deviceId,
  xp: 0,
  level: 1,
  matches: 0,
  wins: 0,
  totalScore: 0,
})

/** 판이 끝났을 때 한 사람이 남기는 것 */
export interface MatchPlayerRecord {
  readonly deviceId: string
  readonly nickname: string
  readonly team: number | null
  readonly score: number
  readonly rank: number
  readonly correctCount: number
  readonly wrongCount: number
  readonly firstAnswerMs: number | null
  readonly xpGained: number
}

export interface MatchRecord {
  readonly id: string
  readonly roomCode: string
  readonly gameId: string
  readonly mode: string
  readonly teamSize: number | null
  readonly rounds: number
  readonly topics: readonly string[]
  readonly startedAt: Date
  readonly players: readonly MatchPlayerRecord[]
}

/**
 * 이 기기의 진행 상황을 읽는다.
 *
 * `deviceId` 는 브라우저가 들고 있는 playerId 다. 계정이 붙기 전까지는
 * 이게 곧 사람이고, 계정을 만들면 `user_devices` 로 이어 붙인다 —
 * 그래야 게스트로 쌓은 기록을 잃지 않는다 (03 문서 §6.2 의 가입 마찰 제거).
 */
export async function readProgress(sql: Sql | null, deviceId: string): Promise<Progress> {
  if (sql === null || deviceId.length === 0) return emptyProgress(deviceId)

  try {
    const rows = await sql<{
      xp: string
      level: number
      matches: number
      wins: number
      total_score: string
    }>`
      SELECT xp, level, matches, wins, total_score
      FROM user_progress
      WHERE device_id = ${deviceId}
    `
    const row = rows[0]
    if (row === undefined) return emptyProgress(deviceId)

    const xp = Number(row.xp)
    return {
      deviceId,
      xp,
      // 저장된 level 을 믿지 않고 xp 에서 다시 뽑는다.
      // 곡선이 바뀌면 저장값이 낡는데, 그때 조용히 틀린 레벨이 보이면 안 된다
      level: levelFromXp(xp),
      matches: row.matches,
      wins: row.wins,
      totalScore: Number(row.total_score),
    }
  } catch {
    // 읽기 실패로 방에 못 들어가면 안 된다
    return emptyProgress(deviceId)
  }
}

/** 여러 기기를 한 번에. 방에 들어온 사람들의 레벨을 한 번에 읽는다 */
export async function readManyProgress(
  sql: Sql | null,
  deviceIds: readonly string[],
): Promise<ReadonlyMap<string, Progress>> {
  const out = new Map<string, Progress>()
  for (const id of deviceIds) out.set(id, emptyProgress(id))
  if (sql === null || deviceIds.length === 0) return out

  try {
    const rows = await sql<{ device_id: string; xp: string }>`
      SELECT device_id, xp FROM user_progress WHERE device_id = ANY(${deviceIds as string[]})
    `
    for (const row of rows) {
      const xp = Number(row.xp)
      out.set(row.device_id, { ...emptyProgress(row.device_id), xp, level: levelFromXp(xp) })
    }
  } catch {
    // 레벨이 잠깐 1 로 보이는 게, 방이 안 열리는 것보다 낫다
  }
  return out
}

/**
 * 판을 기록하고 경험치를 올린다.
 *
 * 한 트랜잭션으로 묶지 않는다 — 여기서 실패해도 판은 이미 끝났고,
 * 부분적으로라도 남는 게 통째로 잃는 것보다 낫다. 정확한 정산이 필요한
 * 랭크전은 나중에 따로 다룬다 (10 문서 §3).
 */
export async function recordMatch(sql: Sql | null, match: MatchRecord): Promise<void> {
  if (sql === null || match.players.length === 0) return

  try {
    await sql`
      INSERT INTO matches (
        id, room_code, game_id, mode, team_size, rounds, player_count, topics, started_at
      ) VALUES (
        ${match.id}, ${match.roomCode}, ${match.gameId}, ${match.mode},
        ${match.teamSize}, ${match.rounds}, ${match.players.length},
        ${match.topics as string[]}, ${match.startedAt}
      )
      ON CONFLICT (id) DO NOTHING
    `

    for (const player of match.players) {
      await sql`
        INSERT INTO match_players (
          match_id, device_id, nickname, team, score, rank,
          correct_count, wrong_count, first_answer_ms, xp_gained
        ) VALUES (
          ${match.id}, ${player.deviceId}, ${player.nickname}, ${player.team},
          ${player.score}, ${player.rank}, ${player.correctCount}, ${player.wrongCount},
          ${player.firstAnswerMs}, ${player.xpGained}
        )
        ON CONFLICT (match_id, device_id) DO NOTHING
      `

      /*
       * 경험치는 절대 내려가지 않는다 (10 문서 §1).
       * xpGained 를 음수로 넣을 일이 없게 호출부에서 막지만, 여기서도
       * GREATEST 로 한 번 더 못 박는다 — 레벨이 내려가는 건 이 제품에서
       * 일어나면 안 되는 일이다.
       *
       * level 칼럼은 xp 에서 파생되는 값이고 조회를 빠르게 하려고 둔다.
       * 진실은 언제나 xp 쪽이라, 읽을 때는 levelFromXp 로 다시 뽑는다.
       */
      const gained = Math.max(0, player.xpGained)
      await sql`
        INSERT INTO user_progress (device_id, xp, level, matches, wins, total_score)
        VALUES (
          ${player.deviceId}, ${gained}, ${levelFromXp(gained)},
          1, ${player.rank === 0 ? 1 : 0}, ${player.score}
        )
        ON CONFLICT (device_id) DO UPDATE SET
          xp          = GREATEST(user_progress.xp, user_progress.xp + ${gained}),
          -- xp 가 확정된 뒤 다시 계산해야 하므로 아래 UPDATE 에서 맞춘다
          level       = user_progress.level,
          matches     = user_progress.matches + 1,
          wins        = user_progress.wins + ${player.rank === 0 ? 1 : 0},
          total_score = user_progress.total_score + ${player.score},
          updated_at  = now()
      `
    }

    // xp 가 확정된 뒤 level 을 한 번에 맞춘다. 곡선을 코드가 알고 있으므로
    // SQL 에 식을 박지 않고, 읽은 값으로 갱신한다
    for (const player of match.players) {
      const rows = await sql<{ xp: string }>`
        SELECT xp FROM user_progress WHERE device_id = ${player.deviceId}
      `
      const xp = Number(rows[0]?.xp ?? 0)
      await sql`
        UPDATE user_progress SET level = ${levelFromXp(xp)} WHERE device_id = ${player.deviceId}
      `
    }
  } catch {
    // 판은 이미 끝났다. 기록을 못 남겼다고 사용자에게 알릴 것은 없다
  }
}

/** 신고를 모아 본다. Discord 는 알림이고 여기는 목록이다 */
export async function recordReport(
  sql: Sql | null,
  report: {
    readonly gameId: string
    readonly topic: string | null
    readonly reason: string
    readonly subject: string
    readonly detail: string
    readonly roomCode: string | null
  },
): Promise<void> {
  if (sql === null) return
  try {
    await sql`
      INSERT INTO content_reports (game_id, topic, reason, subject, detail, room_code)
      VALUES (
        ${report.gameId}, ${report.topic}, ${report.reason},
        ${report.subject}, ${report.detail}, ${report.roomCode}
      )
    `
  } catch {
    // Discord 로는 이미 갔다. 여기 실패는 조용히 넘긴다
  }
}
