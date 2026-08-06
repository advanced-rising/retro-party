/** wrangler.toml 의 바인딩과 1:1로 맞춘다 */
interface Env {
  readonly ROOM: DurableObjectNamespace
  readonly LOBBY: DurableObjectNamespace
}
