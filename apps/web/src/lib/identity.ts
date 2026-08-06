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
const XP_KEY = 'retro:xp'

export interface Identity {
  readonly playerId: string
  readonly nickname: string
}

/**
 * `?as=이름` 이 붙어 있으면 **그 탭만의 신원**을 만든다.
 *
 * 같은 브라우저의 두 탭은 localStorage 를 공유해서 같은 사람이 된다.
 * 그러면 스케치처럼 두 명이 필요한 게임을 혼자서는 확인할 수 없다.
 * 시크릿 창을 띄우는 것보다 이게 빠르다.
 *
 *   /room/ABCDEF?as=철수    ← 탭 1
 *   /room/ABCDEF?as=영희    ← 탭 2
 *
 * sessionStorage 를 쓰므로 탭을 닫으면 사라지고, 새로고침에는 살아남는다
 * (재접속으로 점수를 이어받는 경로를 그대로 확인할 수 있다).
 */
function tabIdentity(alias: string): Identity {
  const key = `retro:as:${alias}`
  let playerId = sessionStorage.getItem(key)
  if (playerId === null || playerId.length === 0) {
    playerId = crypto.randomUUID()
    sessionStorage.setItem(key, playerId)
  }
  return { playerId, nickname: trimName(alias) }
}

export function loadIdentity(): Identity {
  const alias = new URLSearchParams(window.location.search).get('as')
  if (alias !== null && alias.trim().length > 0) return tabIdentity(alias.trim())

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

/**
 * 경험치 — 지금은 **브라우저에만** 쌓인다.
 *
 * 계정과 DB 가 붙기 전이라 서버가 기억할 곳이 없다. 그래서 이 값은
 * 신뢰할 수 없고, 랭크나 보상에 쓰면 안 된다. 「뭔가 쌓인다」는 감각을
 * 콜드스타트 시기에 주기 위한 표시용이다 (10 문서 §7).
 *
 * 계정이 붙으면 서버가 주는 값으로 갈아끼운다 — 읽는 곳이 여기 하나뿐이라
 * 그때 이 함수만 바꾸면 된다.
 */
export function loadXp(): number {
  const raw = Number(localStorage.getItem(XP_KEY) ?? '0')
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

export function addXp(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return loadXp()
  const next = loadXp() + Math.round(amount)
  localStorage.setItem(XP_KEY, String(next))
  return next
}
