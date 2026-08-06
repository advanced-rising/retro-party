'use client'

/**
 * 게스트 신원 — 03 문서 §6.2
 *
 * 가입 화면을 한 번이라도 끼우면 단톡방 8명 중 3명이 사라진다.
 * 그래서 링크를 열면 바로 신원이 생긴다. 계정은 판이 끝난 뒤에 권한다.
 */

const ID_KEY = 'retro:playerId'
const NICK_KEY = 'retro:nickname'

const FIRST = [
  '야타족', '삐삐', '오락실', '워크맨', '죠스바', '롤라장', '만화방', '테트리스',
] as const
const SECOND = [
  '고수', '죽순이', '단골', '전설', '마스터', '초보', '중독자', '왕',
] as const

function randomNickname(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  const a = FIRST[(bytes[0] ?? 0) % FIRST.length] ?? '야타족'
  const b = SECOND[(bytes[1] ?? 0) % SECOND.length] ?? '고수'
  return `${a}${b}`
}

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
    nickname = randomNickname()
    localStorage.setItem(NICK_KEY, nickname)
  }
  return { playerId, nickname }
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICK_KEY, nickname.slice(0, 12))
}

export const API_BASE =
  process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://127.0.0.1:8787'
