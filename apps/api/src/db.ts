import postgres from 'postgres'
import type { Sql } from '@retro/db'

/**
 * Postgres 연결 — Hyperdrive 경유 (05 문서 §5)
 *
 * ## 왜 Hyperdrive 인가
 *
 * Worker 는 요청마다 다른 곳에서 깨어난다. 그때마다 Postgres 에 새로 연결하면
 * TCP + TLS + 인증에 수백 ms 가 든다. Hyperdrive 가 커넥션 풀을 대신 들고
 * 있어서 그 비용을 없앤다.
 *
 * ## 요청마다 새로 만든다
 *
 * 연결을 전역에 캐시하고 싶어지지만 하면 안 된다. Worker 인스턴스는 언제든
 * 재활용되거나 사라지고, 죽은 연결을 들고 있으면 그 인스턴스로 들어온
 * 요청이 전부 실패한다. Hyperdrive 뒤에 풀이 있으므로 매번 만들어도 싸다.
 *
 * ## 없으면 null
 *
 * 로컬 개발과 초기 배포에는 바인딩이 없다. 그때는 null 을 돌려주고
 * @retro/db 의 함수들이 조용히 no-op 이 된다 — 기록보다 판이 우선이다.
 */
export function connect(env: Env): Sql | null {
  const hyperdrive = env.HYPERDRIVE
  if (hyperdrive === undefined) return null

  try {
    return postgres(hyperdrive.connectionString, {
      // Hyperdrive 가 풀을 들고 있으므로 여기서는 하나면 된다
      max: 1,
      // Worker 는 오래 못 산다. 유휴 연결을 붙들고 있을 이유가 없다
      idle_timeout: 10,
      // 준비된 구문은 풀링과 섞이면 문제가 된다
      prepare: false,
      fetch_types: false,
    }) as unknown as Sql
  } catch {
    return null
  }
}
