/** wrangler.toml 의 바인딩과 1:1로 맞춘다 */
interface Env {
  readonly ROOM: DurableObjectNamespace<import('./src/room-do.ts').RoomDO>
  readonly LOBBY: DurableObjectNamespace<import('./src/lobby-do.ts').LobbyDO>
  /**
   * 문항 신고를 받을 Discord 웹훅.
   * 운영에서는 `wrangler secret put DISCORD_WEBHOOK_URL` 로 덮어쓴다.
   */
  readonly DISCORD_WEBHOOK_URL?: string
  /**
   * Postgres — 계정 · 전적 · 레벨 (05 문서 §6).
   *
   * **실시간 경로에 없다.** 판이 시작할 때와 끝날 때만 쓴다.
   * 바인딩이 없으면 기록 없이 게임만 돈다 — 기록보다 판이 우선이다.
   */
  readonly HYPERDRIVE?: Hyperdrive
}
