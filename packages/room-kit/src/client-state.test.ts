import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  asGameId,
  asPlayerId,
  type Participant,
  type ServerMessage,
} from '@retro/types'
import {
  applyServerMessage,
  CHAT_BUFFER,
  connectedCount,
  initialClientState,
  isHost,
  isRevealBoard,
  ranked,
  scoreOf,
  type ClientState,
} from './client-state.ts'

const P = asPlayerId

function player(id: string, connected = true): Participant {
  return {
    playerId: P(id),
    nickname: id,
    avatarIcon: 'floppy-disk',
    level: 1,
    titleName: null,
    team: null,
    connected,
    benched: false,
  }
}

const fold = (messages: readonly ServerMessage[], from = initialClientState()): ClientState =>
  messages.reduce(applyServerMessage, from)

const snapshot: ServerMessage = {
  type: 'snapshot',
  phase: { kind: 'lobby' },
  settings: {
    gameId: asGameId('chosung'),
    mode: 'casual',
    rounds: 3,
    teamSize: null,
    isPublic: true,
    title: '테스트 방',
  },
  participants: [player('a'), player('b')],
  scores: [
    [P('a'), 0],
    [P('b'), 0],
  ],
  hostId: P('a'),
  you: P('b'),
  yourTeam: null,
}

test('스냅샷 하나로 화면이 완전히 복원된다', () => {
  const state = fold([snapshot])
  assert.equal(state.participants.length, 2)
  assert.equal(state.hostId, P('a'))
  assert.equal(state.you, P('b'))
  assert.equal(isHost(state), false, 'b 는 방장이 아니다')
  assert.equal(isHost({ ...state, you: P('a') }), true)
})

test('공개된 정답은 다음 라운드로 넘어갈 때 지워진다', () => {
  const withReveal = fold([
    snapshot,
    { type: 'phase', phase: { kind: 'reveal', roundNo: 0, endsAtMs: 100 } },
    { type: 'board', view: { revealed: '삐삐', detail: null } },
  ])
  assert.ok(isRevealBoard(withReveal.board), '공개 단계에서는 정답 카드가 있다')

  const nextRound = applyServerMessage(withReveal, {
    type: 'phase',
    phase: { kind: 'playing', roundNo: 1, endsAtMs: 200, roundMs: 100 },
  })
  assert.equal(nextRound.board, null, '다음 문제 위에 지난 정답이 남으면 안 된다')
})

test('일반 board 는 페이즈가 바뀌어도 유지된다', () => {
  const state = fold([
    snapshot,
    { type: 'phase', phase: { kind: 'playing', roundNo: 0, endsAtMs: 100, roundMs: 100 } },
    { type: 'board', view: { chosung: 'ㅃㅃ', solvedCount: 0 } },
    { type: 'phase', phase: { kind: 'playing', roundNo: 0, endsAtMs: 100, roundMs: 100 } },
  ])
  assert.deepEqual(state.board, { chosung: 'ㅃㅃ', solvedCount: 0 })
})

test('나간 사람은 목록에서 사라지지 않고 끊김으로 남는다', () => {
  const state = fold([snapshot, { type: 'left', playerId: P('a') }])
  assert.equal(state.participants.length, 2, '자리를 지우면 재접속했을 때 순서가 흔들린다')
  assert.equal(state.participants.find((p) => p.playerId === P('a'))?.connected, false)
  assert.equal(connectedCount(state), 1)

  const back = applyServerMessage(state, { type: 'joined', participant: player('a') })
  assert.equal(back.participants.length, 2, '재접속이 중복 항목을 만들면 안 된다')
  assert.equal(connectedCount(back), 2)
})

test('채팅 버퍼는 무한히 자라지 않는다', () => {
  const many: ServerMessage[] = Array.from({ length: CHAT_BUFFER + 40 }, (_, i) => ({
    type: 'chat',
    line: { from: P('a'), text: `줄 ${i}`, channel: 'all', correct: null, note: null },
  }))
  const state = fold([snapshot, ...many])
  assert.equal(state.lines.length, CHAT_BUFFER)
  assert.equal(state.lines.at(-1)?.text, `줄 ${CHAT_BUFFER + 39}`, '최신 줄이 남아야 한다')
})

test('점수는 서버가 보낸 값을 그대로 쓴다', () => {
  const state = fold([
    snapshot,
    {
      type: 'score',
      scores: [
        [P('a'), 150],
        [P('b'), 70],
      ],
    },
  ])
  assert.equal(scoreOf(state, P('a')), 150)
  assert.equal(scoreOf(state, P('b')), 70)
  assert.equal(scoreOf(state, P('없는사람')), 0)
  assert.deepEqual(
    ranked(state).map((p) => p.playerId),
    [P('a'), P('b')],
  )
})

test('정답 채팅은 강조 정보를 그대로 들고 온다', () => {
  const state = fold([
    snapshot,
    {
      type: 'chat',
      line: { from: P('b'), text: '삐삐', channel: 'all', correct: { points: 150, rank: 0 }, note: null },
    },
  ])
  assert.equal(state.lines[0]?.correct?.points, 150)
})

test('에러 메시지가 화면에 전달된다', () => {
  const state = fold([
    snapshot,
    { type: 'error', code: 'rate_limited', message: '조금 천천히 입력해 주세요' },
  ])
  assert.equal(state.error, '조금 천천히 입력해 주세요')
})
