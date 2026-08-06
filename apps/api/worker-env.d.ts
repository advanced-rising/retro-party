/** wrangler.toml 의 바인딩과 1:1로 맞춘다 */
interface Env {
  readonly ROOM: DurableObjectNamespace
  readonly LOBBY: DurableObjectNamespace
  /**
   * 문항 신고를 받을 Discord 웹훅.
   * 운영에서는 `wrangler secret put DISCORD_WEBHOOK_URL` 로 덮어쓴다.
   */
  readonly DISCORD_WEBHOOK_URL?: string
}
