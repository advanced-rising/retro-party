/**
 * 레벨과 칭호 — 10 문서 §1 · §2
 *
 * 레벨은 **떨어지지 않는다.** 실력이 아니라 "얼마나 했나"를 뜻한다.
 * 실력은 랭크가 따로 맡는다 — 둘을 섞으면 오래 한 사람이 무조건 고수가 된다.
 *
 * 곡선은 **초반이 빠르고 후반이 느리다.** 첫날 10레벨을 찍게 해서 진행감을 주고,
 * 100레벨은 장기 목표로 남긴다.
 */

export const MAX_LEVEL = 100

/**
 * 레벨 곡선의 기준점 — 10 문서 §1.3 의 표를 그대로 옮겼다.
 *
 * 문서에 `40 × n^1.85` 이라는 초안 식도 적혀 있지만 실제 표와 안 맞는다
 * (100레벨에서 20만 vs 50만). 표가 의도이므로 표를 따르고 사이를 잇는다.
 *
 * 10 문서는 이 곡선을 **DB 파라미터로 두라**고 했다. 아직 DB 가 없어서
 * 여기 두지만, 값을 바꿔도 다른 코드가 안 깨지도록 함수 하나로 가둔다.
 */
const ANCHORS: readonly (readonly [level: number, xp: number])[] = [
  [1, 0],
  [10, 3_000],
  [25, 20_000],
  [45, 70_000],
  [70, 180_000],
  [90, 350_000],
  [100, 500_000],
]

/** 레벨 N 에 도달하는 데 필요한 누적 경험치 */
export function xpForLevel(level: number): number {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))
  if (n <= 1) return 0

  for (let i = 1; i < ANCHORS.length; i++) {
    const from = ANCHORS[i - 1]
    const to = ANCHORS[i]
    if (from === undefined || to === undefined) continue
    if (n > to[0]) continue

    // 기준점 사이는 직선으로 잇는다. 구간마다 기울기가 달라 곡선이 된다
    const span = to[0] - from[0]
    const ratio = span === 0 ? 0 : (n - from[0]) / span
    return Math.round(from[1] + (to[1] - from[1]) * ratio)
  }
  return ANCHORS.at(-1)?.[1] ?? 0
}

export function levelFromXp(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0
  let level = 1
  while (level < MAX_LEVEL && safe >= xpForLevel(level + 1)) level++
  return level
}

export interface LevelProgress {
  readonly level: number
  readonly xp: number
  /** 이번 레벨 안에서 얼마나 왔는가 (0~1). 만렙이면 1 */
  readonly ratio: number
  /** 다음 레벨까지 남은 경험치. 만렙이면 0 */
  readonly toNext: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp)
  if (level >= MAX_LEVEL) return { level, xp, ratio: 1, toNext: 0 }

  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  const span = Math.max(1, ceiling - floor)
  return {
    level,
    xp,
    ratio: Math.min(1, Math.max(0, (xp - floor) / span)),
    toNext: Math.max(0, ceiling - xp),
  }
}

/**
 * 칭호 — 급 · 단 (10 문서 §2.2)
 *
 * 바둑·무도의 방식을 그대로 쓴다. **급은 내려가면서 올라가고, 단은 올라간다.**
 * 18급에서 시작해 1급까지 좁혀 가고, 그다음 초단부터 9단까지 오른다.
 *
 * 이 형태를 고른 이유는 두 가지다.
 *   · 숫자 하나로 "얼마나 왔는지"가 바로 읽힌다 — 3급과 5단의 거리가 감으로 온다
 *   · 급 구간이 길어서 초반 진행감이 촘촘하다. 3레벨마다 한 급씩 오른다
 *
 * **레벨과 별개가 아니라 레벨의 다른 표기다.** 실력(랭크)과 혼동하면 안 된다 —
 * 급·단은 "얼마나 했나"이고 랭크는 "얼마나 잘하나"다 (10 문서 §1).
 */

/** 급 구간이 끝나고 단이 시작되는 레벨 */
export const FIRST_DAN_LEVEL = 55

/** 가장 낮은 급 */
export const LOWEST_KYU = 18
/** 급 하나가 몇 레벨인가 */
const LEVELS_PER_KYU = 3
/** 단 하나가 몇 레벨인가 */
const LEVELS_PER_DAN = 5
export const HIGHEST_DAN = 9

export interface LevelTitle {
  /** 「7급」 「초단」 「5단」 */
  readonly name: string
  readonly kind: 'kyu' | 'dan'
  /** 급이면 18~1, 단이면 1~9 */
  readonly grade: number
  readonly icon: string
}

const kyuIcon = (kyu: number): string =>
  kyu >= 13 ? 'circle' : kyu >= 7 ? 'shield' : 'award'

const danIcon = (dan: number): string => (dan >= 7 ? 'crown' : dan >= 4 ? 'gem' : 'medal')

/** 레벨을 급·단으로 바꾼다 */
export function titleFor(level: number): LevelTitle {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))

  if (n < FIRST_DAN_LEVEL) {
    // 레벨이 오를수록 급 숫자는 내려간다
    const steps = Math.floor((n - 1) / LEVELS_PER_KYU)
    const kyu = Math.max(1, LOWEST_KYU - steps)
    return { name: `${kyu}급`, kind: 'kyu', grade: kyu, icon: kyuIcon(kyu) }
  }

  const steps = Math.floor((n - FIRST_DAN_LEVEL) / LEVELS_PER_DAN)
  const dan = Math.min(HIGHEST_DAN, 1 + steps)
  return {
    name: dan === 1 ? '초단' : `${dan}단`,
    kind: 'dan',
    grade: dan,
    icon: danIcon(dan),
  }
}

/** 지금까지 거쳐온 칭호. 낮은 걸 일부러 달 수도 있다 (10 문서 §2.2) */
export function unlockedTitles(level: number): readonly LevelTitle[] {
  const seen = new Map<string, LevelTitle>()
  for (let n = 1; n <= Math.min(MAX_LEVEL, Math.max(1, level)); n++) {
    const title = titleFor(n)
    if (!seen.has(title.name)) seen.set(title.name, title)
  }
  return [...seen.values()]
}

/** 다음 급·단까지 남은 레벨. 만렙이면 0 */
export function levelsToNextTitle(level: number): number {
  const now = titleFor(level).name
  for (let n = level + 1; n <= MAX_LEVEL; n++) {
    if (titleFor(n).name !== now) return n - level
  }
  return 0
}
