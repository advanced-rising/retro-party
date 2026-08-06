import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asSeed } from '@retro/types'
import { createRng } from './rng.ts'
import {
  makeNickname,
  trimName,
  MAX_NICKNAME,
  NICKNAME_COMBINATIONS,
  NICKNAME_PARTS,
} from './nickname.ts'

test('조합이 만 개를 넘는다', () => {
  assert.ok(
    NICKNAME_COMBINATIONS >= 10_000,
    `조합이 ${NICKNAME_COMBINATIONS}개뿐 — 한 방에 같은 이름이 앉는다`,
  )
  assert.equal(NICKNAME_PARTS.length, NICKNAME_COMBINATIONS)
})

test('★ 모든 조합이 길이 제한 안에 들어온다', () => {
  for (const { modifier, subject } of NICKNAME_PARTS) {
    const name = `${modifier}${subject}`
    assert.ok(
      [...name].length <= MAX_NICKNAME,
      `"${name}" 이 ${[...name].length}자 — 참가자 목록이 밀린다`,
    )
  }
})

test('조합에 빈 조각이 없다', () => {
  for (const { modifier, subject } of NICKNAME_PARTS) {
    assert.ok(modifier.trim().length > 0)
    assert.ok(subject.trim().length > 0)
  }
})

test('같은 시드는 같은 이름을 만든다', () => {
  const a = makeNickname(createRng(asSeed('seed-1')))
  const b = makeNickname(createRng(asSeed('seed-1')))
  assert.equal(a, b)
})

test('실제로 다양하게 나온다', () => {
  const names = new Set<string>()
  for (let i = 0; i < 400; i++) names.add(makeNickname(createRng(asSeed(`s-${i}`))))
  assert.ok(names.size > 300, `400번 뽑아 ${names.size}종 — 너무 겹친다`)
})

test('이름을 코드포인트 단위로 자른다', () => {
  assert.equal(trimName('  야타족  '), '야타족')
  assert.equal([...trimName('가'.repeat(40))].length, MAX_NICKNAME)
  assert.equal(trimName('   '), '이름없음')
})
