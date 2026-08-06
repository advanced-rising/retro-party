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

export interface ChosungBoard {
  readonly chosung: string
  readonly length: number
  readonly category: string
  readonly hint: string | null
  readonly firstVowel: string | null
  readonly solvedCount: number
  readonly youSolved: boolean
}

export const isChosungBoard = (board: unknown): board is ChosungBoard =>
  typeof board === 'object' && board !== null && 'chosung' in board

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
): readonly [RoomView, RoomActions] {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<ClientState>(initialClientState)

  useEffect(() => {
    if (code.length === 0 || playerId.length === 0) return

    const base = apiBase.replace(/^http/, 'ws')
    const url = `${base}/api/rooms/${code}/ws?playerId=${encodeURIComponent(playerId)}&nickname=${encodeURIComponent(nickname)}`

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
  }, [apiBase, code, playerId, nickname])

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
