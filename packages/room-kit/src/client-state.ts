import type {
  ChatLine,
  Participant,
  PlayerId,
  RoomPhase,
  RoomSettings,
  RoundRecord,
  ServerMessage,
  TeamId,
} from '@retro/types'

/**
 * 클라이언트 상태 접기
 *
 * 서버가 보낸 ServerMessage 를 화면 상태로 접는 순수 함수.
 * React 밖에 있는 이유는 두 가지다.
 *   1. 노드에서 테스트할 수 있다 — UI 글루로 두면 아무도 검증하지 못한다
 *   2. 프로토콜을 아는 코드가 프로토콜 정의 옆에 있다
 *
 * 화면은 스스로 게임 상태를 계산하지 않는다. 여기 있는 것은 전부
 * 서버가 보내준 값을 담아두는 일뿐이고, 판정·점수 계산은 하나도 없다.
 */

/** 채팅은 화면 메모리에만 산다. 서버는 저장하지 않는다 — 08 문서 §11 */
export const CHAT_BUFFER = 80

export interface ClientState {
  readonly phase: RoomPhase
  readonly settings: RoomSettings | null
  readonly participants: readonly Participant[]
  readonly scores: ReadonlyMap<PlayerId, number>
  readonly hostId: PlayerId | null
  readonly you: PlayerId | null
  readonly yourTeam: TeamId | null
  /** 게임별 문제 뷰. 타입은 게임 모듈이 안다 */
  readonly board: unknown
  readonly lines: readonly ChatLine[]
  /** 판이 끝나면 채워진다. 진행 중에는 비어 있다 */
  readonly history: readonly RoundRecord[]
  /** 이 라운드의 스킵 표 현황 */
  readonly skip: { readonly votes: number; readonly needed: number; readonly you: boolean }
  /** 이 라운드의 힌트 표 현황 */
  readonly hint: {
    readonly votes: number
    readonly needed: number
    readonly you: boolean
    readonly available: boolean
  }
  readonly error: string | null
}

export function initialClientState(): ClientState {
  return {
    phase: { kind: 'lobby' },
    settings: null,
    participants: [],
    scores: new Map(),
    hostId: null,
    you: null,
    yourTeam: null,
    board: null,
    lines: [],
    history: [],
    skip: { votes: 0, needed: 0, you: false },
    hint: { votes: 0, needed: 0, you: false, available: true },
    error: null,
  }
}

/** 공개 단계에 서버가 보내는 board. 정답이 담긴 유일한 뷰다 */
export interface RevealBoard {
  readonly revealed: string
  readonly detail: unknown
}

export function isRevealBoard(board: unknown): board is RevealBoard {
  return typeof board === 'object' && board !== null && 'revealed' in board
}

export function applyServerMessage(state: ClientState, message: ServerMessage): ClientState {
  switch (message.type) {
    case 'snapshot':
      return {
        ...state,
        phase: message.phase,
        settings: message.settings,
        participants: message.participants,
        scores: new Map(message.scores),
        hostId: message.hostId,
        you: message.you,
        yourTeam: message.yourTeam,
      }

    case 'phase': {
      // 새 라운드로 넘어갈 때 이전 정답 카드를 지운다.
      // 안 지우면 다음 문제 위에 지난 답이 남아 있다
      const stale = isRevealBoard(state.board) && message.phase.kind !== 'reveal'
      // 새 판이 시작되면 지난 기록도 치운다
      const history = message.phase.kind === 'countdown' ? [] : state.history
      // 라운드가 바뀌면 스킵 표도 초기화된다
      const fresh = message.phase.kind === 'playing'
      return {
        ...state,
        phase: message.phase,
        board: stale ? null : state.board,
        history,
        skip: fresh ? { votes: 0, needed: 0, you: false } : state.skip,
        hint: fresh ? { votes: 0, needed: 0, you: false, available: true } : state.hint,
      }
    }

    case 'joined': {
      const known = state.participants.some(
        (p) => p.playerId === message.participant.playerId,
      )
      return {
        ...state,
        participants: known
          ? state.participants.map((p) =>
              p.playerId === message.participant.playerId ? message.participant : p,
            )
          : [...state.participants, message.participant],
      }
    }

    case 'left':
      // 자리를 지우지 않는다. 재접속하면 그대로 돌아온다 (엔진 join 경로)
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.playerId === message.playerId ? { ...p, connected: false } : p,
        ),
      }

    case 'board':
      return { ...state, board: message.view }

    case 'score':
      return { ...state, scores: new Map(message.scores) }

    case 'history':
      return { ...state, history: message.rounds }

    case 'skip':
      return {
        ...state,
        skip: { votes: message.votes, needed: message.needed, you: message.you },
      }

    case 'hint':
      return {
        ...state,
        hint: {
          votes: message.votes,
          needed: message.needed,
          you: message.you,
          available: message.available,
        },
      }

    case 'chat':
      return { ...state, lines: [...state.lines, message.line].slice(-CHAT_BUFFER) }

    case 'error':
      return { ...state, error: message.message }
  }
}

export function scoreOf(state: ClientState, playerId: PlayerId): number {
  return state.scores.get(playerId) ?? 0
}

export function isHost(state: ClientState): boolean {
  return state.you !== null && state.you === state.hostId
}

export function connectedCount(state: ClientState): number {
  return state.participants.filter((p) => p.connected).length
}

/** 점수 내림차순. 동점이면 참가 순서를 지킨다 */
export function ranked(state: ClientState): readonly Participant[] {
  return [...state.participants].sort(
    (a, b) => scoreOf(state, b.playerId) - scoreOf(state, a.playerId),
  )
}
