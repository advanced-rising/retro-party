import { DurableObject } from 'cloudflare:workers'
import { listableRooms, pickQuickJoin, ROOM_STALE_MS, type RoomSummary } from '@retro/types'

/**
 * LobbyDO — 방 목록 집계. 05 문서 §3
 *
 * ## RPC 로 부른다
 *
 * 예전에는 `stub.fetch('https://lobby/list')` 처럼 문자열 URL 로 불렀다.
 * 그러면 경로를 오타 내도 컴파일이 통과하고, 인자와 반환을 매번 JSON 으로
 * 싸고 풀어야 하고, 타입이 경계에서 끊긴다.
 *
 * `DurableObject` 를 상속하면 **메서드를 그냥 부를 수 있다.** 인자와 반환값이
 * 구조화 복제로 오가서 타입이 끝까지 살아 있고, 경로 라우팅이 사라진다.
 *
 * 정렬 규칙(사람 수 내림차순 · 빈 방 미노출)은 @retro/types 의 순수 함수라
 * 노드에서 테스트된다 — 03 문서 §4.2 의 뭉치기 압력이 여기 걸려 있다.
 */

const STORAGE_KEY = 'rooms'

/** 신고 폭주 방어 — 한 번에 최대 5건, 20초마다 1건씩 회복 */
const REPORT_BURST = 5
const REPORT_REFILL_MS = 20_000

export class LobbyDO extends DurableObject<Env> {
  private rooms = new Map<string, RoomSummary>()
  private loaded = false
  /** 신고 토큰 버킷. 폭주하면 웹훅이 막히고 진짜 신고가 묻힌다 */
  private reportTokens = REPORT_BURST
  private reportRefilledAtMs = 0

  private async load(): Promise<void> {
    if (this.loaded) return
    const saved = await this.ctx.storage.get<readonly RoomSummary[]>(STORAGE_KEY)
    for (const room of saved ?? []) this.rooms.set(room.code, room)
    this.loaded = true
  }

  /** 죽은 방을 걷어낸다. 방이 알림 없이 사라지는 경우가 항상 있다 */
  private sweep(nowMs: number): void {
    for (const [code, room] of this.rooms) {
      if (nowMs - room.updatedAtMs >= ROOM_STALE_MS) this.rooms.delete(code)
    }
  }

  private async ready(nowMs: number): Promise<void> {
    await this.load()
    this.sweep(nowMs)
  }

  /** RoomDO 가 자기 상태를 알려온다 */
  async report(summary: Omit<RoomSummary, 'updatedAtMs'>): Promise<void> {
    const nowMs = Date.now()
    await this.ready(nowMs)

    // 사람이 없는 방은 목록에서 지운다. 살아 있어도 띄우지 않는다
    if (summary.players === 0) this.rooms.delete(summary.code)
    else this.rooms.set(summary.code, { ...summary, updatedAtMs: nowMs })

    await this.ctx.storage.put(STORAGE_KEY, [...this.rooms.values()])
  }

  async list(): Promise<readonly RoomSummary[]> {
    const nowMs = Date.now()
    await this.ready(nowMs)
    return listableRooms([...this.rooms.values()], nowMs)
  }

  /** [바로 참가] 가 고를 방. 없으면 null */
  async quickJoin(): Promise<string | null> {
    const nowMs = Date.now()
    await this.ready(nowMs)
    return pickQuickJoin([...this.rooms.values()], nowMs)?.code ?? null
  }

  /**
   * 신고 토큰을 하나 꺼낸다. 없으면 거절한다.
   * 사람이 손으로 누르는 기능이라 이 정도면 충분하고, 스크립트 폭주는 막힌다.
   */
  takeReportQuota(): boolean {
    const nowMs = Date.now()
    const elapsed = nowMs - this.reportRefilledAtMs
    if (elapsed >= REPORT_REFILL_MS) {
      this.reportTokens = Math.min(
        REPORT_BURST,
        this.reportTokens + Math.floor(elapsed / REPORT_REFILL_MS),
      )
      this.reportRefilledAtMs = nowMs
    }
    if (this.reportTokens <= 0) return false
    this.reportTokens -= 1
    return true
  }
}
