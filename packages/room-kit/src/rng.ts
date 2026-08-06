import type { Seed } from '@retro/types'

/**
 * 시드 기반 결정적 난수 — xoshiro128**
 *
 * 게임 모듈은 Math.random() 을 쓰지 않는다. 같은 시드에서 같은 문제가 나와야
 * 데일리(전원 동일 문제)와 랭크전(공정성)이 성립한다.
 */
export interface Rng {
  /** [0, 1) */
  next(): number
  /** [0, maxExclusive) 정수 */
  int(maxExclusive: number): number
  /** 비어 있지 않은 배열에서 하나 — undefined 가 나올 수 없다 */
  pick<T>(xs: NonEmptyArray<T>): T
  /** 원본을 바꾸지 않고 섞은 새 배열 */
  shuffle<T>(xs: readonly T[]): T[]
}

export type NonEmptyArray<T> = readonly [T, ...(readonly T[])]

export function isNonEmpty<T>(xs: readonly T[]): xs is NonEmptyArray<T> {
  return xs.length > 0
}

/** 문자열 시드를 4개의 32비트 상태로 흩뿌린다 */
function splitmix32(seed: string): [number, number, number, number] {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const step = (): number => {
    h = (h + 0x9e3779b9) >>> 0
    let z = h
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
  }
  return [step(), step(), step(), step()]
}

export function createRng(seed: Seed): Rng {
  const s = splitmix32(seed)
  const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0

  const nextUint32 = (): number => {
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0) >>> 0
    const t = (s[1] << 9) >>> 0
    s[2] = (s[2] ^ s[0]) >>> 0
    s[3] = (s[3] ^ s[1]) >>> 0
    s[1] = (s[1] ^ s[2]) >>> 0
    s[0] = (s[0] ^ s[3]) >>> 0
    s[2] = (s[2] ^ t) >>> 0
    s[3] = rotl(s[3], 11)
    return result
  }

  const next = (): number => nextUint32() / 0x1_0000_0000

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int(maxExclusive) 는 양의 정수여야 합니다: ${maxExclusive}`)
    }
    return Math.floor(next() * maxExclusive)
  }

  return {
    next,
    int,
    pick<T>(xs: NonEmptyArray<T>): T {
      // NonEmptyArray 라 인덱스 0 은 항상 존재한다
      const i = int(xs.length)
      return i === 0 ? xs[0] : (xs[i] as T)
    },
    shuffle<T>(xs: readonly T[]): T[] {
      const out = [...xs]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1)
        const a = out[i] as T
        const b = out[j] as T
        out[i] = b
        out[j] = a
      }
      return out
    },
  }
}

/** 시드 파생 — 같은 방의 같은 라운드는 항상 같은 문제 */
export function deriveSeed(base: Seed, ...parts: readonly (string | number)[]): Seed {
  return `${base}:${parts.join(':')}` as Seed
}
