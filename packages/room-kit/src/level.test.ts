import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  levelFromXp,
  levelProgress,
  levelsToNextTitle,
  titleFor,
  unlockedTitles,
  xpForLevel,
  FIRST_DAN_LEVEL,
  HIGHEST_DAN,
  LOWEST_KYU,
  MAX_LEVEL,
} from './level.ts'

test('레벨은 1부터 시작한다', () => {
  assert.equal(levelFromXp(0), 1)
  assert.equal(levelFromXp(-100), 1, '음수여도 깨지지 않는다')
  assert.equal(xpForLevel(1), 0)
})

test('★ 곡선이 10 문서의 기준점과 맞는다', () => {
  assert.equal(xpForLevel(10), 3_000, '첫날 10레벨')
  assert.equal(xpForLevel(25), 20_000)
  assert.equal(xpForLevel(45), 70_000)
  assert.equal(xpForLevel(70), 180_000)
  assert.equal(xpForLevel(90), 350_000)
  assert.equal(xpForLevel(100), 500_000)
})

test('경험치가 오르면 레벨이 오른다 — 절대 안 내려간다', () => {
  let last = 0
  for (let xp = 0; xp <= 520_000; xp += 2_500) {
    const level = levelFromXp(xp)
    assert.ok(level >= last, `${xp} 에서 레벨이 내려갔다`)
    last = level
  }
  assert.equal(last, MAX_LEVEL)
})

test('만렙을 넘지 않는다', () => {
  assert.equal(levelFromXp(9_999_999), MAX_LEVEL)
  assert.equal(xpForLevel(500), xpForLevel(MAX_LEVEL))
})

test('진행률이 0~1 안에 있다', () => {
  for (const xp of [0, 1_500, 3_000, 50_000, 349_999, 500_000, 900_000]) {
    const p = levelProgress(xp)
    assert.ok(p.ratio >= 0 && p.ratio <= 1, `${xp} → ratio ${p.ratio}`)
    assert.ok(p.toNext >= 0)
  }
  assert.equal(levelProgress(3_000).ratio, 0, '레벨 시작점은 0')
  assert.equal(levelProgress(600_000).ratio, 1, '만렙은 1')
})

// ── 급 · 단 ─────────────────────────────────────────

test('★ 급은 내려가면서 올라간다', () => {
  assert.equal(titleFor(1).name, `${LOWEST_KYU}급`)
  assert.equal(titleFor(1).kind, 'kyu')

  // 레벨이 오를수록 급 숫자는 작아진다
  let previous = LOWEST_KYU + 1
  for (let level = 1; level < FIRST_DAN_LEVEL; level++) {
    const title = titleFor(level)
    assert.equal(title.kind, 'kyu', `Lv${level} 은 아직 급이어야 한다`)
    assert.ok(title.grade <= previous, `Lv${level} 에서 급이 거꾸로 갔다`)
    previous = title.grade
  }
  assert.equal(titleFor(FIRST_DAN_LEVEL - 1).grade, 1, '단 직전은 1급')
})

test('★ 단은 올라가면서 올라간다', () => {
  assert.equal(titleFor(FIRST_DAN_LEVEL).name, '초단', '첫 단은 초단이다')
  assert.equal(titleFor(FIRST_DAN_LEVEL).kind, 'dan')

  let previous = 0
  for (let level = FIRST_DAN_LEVEL; level <= MAX_LEVEL; level++) {
    const title = titleFor(level)
    assert.equal(title.kind, 'dan')
    assert.ok(title.grade >= previous, `Lv${level} 에서 단이 내려갔다`)
    previous = title.grade
  }
  assert.equal(titleFor(MAX_LEVEL).name, `${HIGHEST_DAN}단`, '만렙은 9단')
})

test('급에서 단으로 넘어가는 지점이 하나뿐이다', () => {
  let switches = 0
  for (let level = 2; level <= MAX_LEVEL; level++) {
    if (titleFor(level).kind !== titleFor(level - 1).kind) switches++
  }
  assert.equal(switches, 1, '급 → 단 전환은 한 번만 일어난다')
})

test('칭호가 총 27개다 — 18급 + 9단', () => {
  assert.equal(unlockedTitles(MAX_LEVEL).length, LOWEST_KYU + HIGHEST_DAN)
})

test('거쳐온 칭호가 남는다', () => {
  assert.deepEqual(unlockedTitles(1).map((t) => t.name), [`${LOWEST_KYU}급`])
  assert.ok(unlockedTitles(60).some((t) => t.name === '초단'))
  assert.ok(unlockedTitles(60).some((t) => t.name === `${LOWEST_KYU}급`), '낮은 급도 남는다')
})

test('다음 칭호까지 남은 레벨을 알려준다', () => {
  assert.ok(levelsToNextTitle(1) > 0)
  assert.equal(levelsToNextTitle(MAX_LEVEL), 0, '만렙은 더 오를 곳이 없다')
  // 실제로 그 레벨에 도달하면 칭호가 바뀐다
  const gap = levelsToNextTitle(20)
  assert.notEqual(titleFor(20).name, titleFor(20 + gap).name)
})
