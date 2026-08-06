'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatChannel, RoomSettings, ServerMessage } from '@retro/types'
import {
  applyServerMessage,
  initialClientState,
  type ClientState,
} from '@retro/room-kit/client-state'

/**
 * 방 소켓 — 연결만 다룬다.
 *
 * 메시지를 상태로 접는 일은 @retro/room-kit 의 순수 리듀서가 한다 (노드에서 테스트됨).
 * 여기 있는 것은 소켓을 열고, 끊기면 다시 붙고, 리듀서에 넘기는 배선뿐이다.
 */

export interface RoomView extends ClientState {
  readonly connected: boolean
}

export interface RoomActions {
  send(text: string, channel: ChatChannel): void
  start(): void
  again(): void
  patchSettings(patch: Partial<RoomSettings>): void
}

const isServerMessage = (value: unknown): value is ServerMessage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string'

/** 끊기면 이 간격으로 다시 붙는다. 점수는 서버가 들고 있다 */
const RETRY_MS = 1_200

export function useRoomSocket(
  apiBase: string,
  code: string,
  playerId: string,
  nickname: string,
  /** 잠긴 방의 1회용 티켓. 비밀번호 원문은 절대 여기 오지 않는다 */
  ticket: string | null = null,
): readonly [RoomView, RoomActions] {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<ClientState>(initialClientState)

  useEffect(() => {
    if (code.length === 0 || playerId.length === 0) return

    const base = apiBase.replace(/^http/, 'ws')
    const query = new URLSearchParams({ playerId, nickname })
    if (ticket !== null) query.set('ticket', ticket)
    const url = `${base}/api/rooms/${code}/ws?${query.toString()}`

    let closedByUs = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const open = (): void => {
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.addEventListener('open', () => setConnected(true))

      socket.addEventListener('close', () => {
        setConnected(false)
        if (closedByUs) return
        retryTimer = setTimeout(open, RETRY_MS)
      })

      socket.addEventListener('message', (event: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (!isServerMessage(parsed)) return
        setState((prev) => applyServerMessage(prev, parsed))
      })
    }

    open()

    return () => {
      closedByUs = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [apiBase, code, playerId, nickname, ticket])

  const emit = useCallback((payload: unknown): void => {
    const socket = socketRef.current
    if (socket === null || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }, [])

  const send = useCallback(
    (text: string, channel: ChatChannel) => emit({ type: 'chat', text, channel }),
    [emit],
  )
  const start = useCallback(() => emit({ type: 'start' }), [emit])
  const again = useCallback(() => emit({ type: 'again' }), [emit])
  const patchSettings = useCallback(
    (patch: Partial<RoomSettings>) => emit({ type: 'settings', patch }),
    [emit],
  )

  return [{ ...state, connected }, { send, start, again, patchSettings }] as const
}
