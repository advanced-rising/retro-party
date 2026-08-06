'use client'

/**
 * 게스트 신원 — 03 문서 §6.2
 *
 * 가입 화면을 한 번이라도 끼우면 단톡방 8명 중 3명이 사라진다.
 * 그래서 링크를 열면 바로 신원이 생긴다. 계정은 판이 끝난 뒤에 권한다.
 */

import { makeNickname, trimName } from '@retro/room-kit'

const ID_KEY = 'retro:playerId'
const NICK_KEY = 'retro:nickname'

export interface Identity {
  readonly playerId: string
  readonly nickname: string
}

export function loadIdentity(): Identity {
  let playerId = localStorage.getItem(ID_KEY)
  if (playerId === null || playerId.length === 0) {
    playerId = crypto.randomUUID()
    localStorage.setItem(ID_KEY, playerId)
  }
  let nickname = localStorage.getItem(NICK_KEY)
  if (nickname === null || nickname.length === 0) {
    nickname = makeNickname()
    localStorage.setItem(NICK_KEY, nickname)
  }
  return { playerId, nickname }
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICK_KEY, trimName(nickname))
}

export const API_BASE =
  process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://127.0.0.1:8787'
