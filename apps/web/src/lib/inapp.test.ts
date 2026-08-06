import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectInApp, detectPlatform, planEscape } from './inapp.ts'

/**
 * UA 문자열은 조용히 바뀐다. 실제 기기에서 뽑은 문자열을 그대로 박아두고,
 * 정상 브라우저를 인앱으로 잘못 보는 일이 없는지 함께 본다.
 */

const UA = {
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  kakaoAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S928N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0.0.0 (iPhone15,2; iOS 17_5)',
  lineIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.6.0',
  naverIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 NAVER(inapp; search; 2000; 12.9.2)',
  androidWebview:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
} as const

const TARGET = 'https://retro-party.example/room/ABCDEF'

// ── ★ 정상 브라우저를 잘못 잡으면 안 된다 ────────────

test('정상 브라우저는 인앱으로 보지 않는다', () => {
  assert.equal(detectInApp(UA.safariIos), null, 'iOS Safari')
  assert.equal(detectInApp(UA.chromeAndroid), null, '안드로이드 Chrome 정식 앱')
  assert.equal(detectInApp(UA.chromeDesktop), null, '데스크톱 Chrome')
  assert.equal(detectInApp(''), null)
})

test('정상 브라우저에는 탈출 계획이 없다', () => {
  assert.equal(planEscape(UA.safariIos, TARGET).kind, 'none')
  assert.equal(planEscape(UA.chromeAndroid, TARGET).kind, 'none')
  assert.equal(planEscape(UA.chromeDesktop, TARGET).kind, 'none')
})

// ── 인앱 판별 ───────────────────────────────────────

test('주요 인앱 브라우저를 잡는다', () => {
  assert.equal(detectInApp(UA.kakaoIos), 'kakaotalk')
  assert.equal(detectInApp(UA.kakaoAndroid), 'kakaotalk')
  assert.equal(detectInApp(UA.instagramIos), 'instagram')
  assert.equal(detectInApp(UA.lineIos), 'line')
  assert.equal(detectInApp(UA.naverIos), 'naver')
  assert.equal(detectInApp(UA.androidWebview), 'unknown-inapp', '안드로이드 WebView 표식')
})

test('플랫폼을 구분한다', () => {
  assert.equal(detectPlatform(UA.kakaoIos), 'ios')
  assert.equal(detectPlatform(UA.kakaoAndroid), 'android')
  assert.equal(detectPlatform(UA.chromeDesktop), 'other')
})

// ── ★ 카카오톡 — 가장 흔한 경로 ─────────────────────

test('카카오톡은 iOS·안드로이드 모두 자동 탈출한다', () => {
  for (const ua of [UA.kakaoIos, UA.kakaoAndroid]) {
    const plan = planEscape(ua, TARGET)
    assert.equal(plan.kind, 'auto', '카카오톡은 공식 스킴이 있다')
    if (plan.kind !== 'auto') return
    assert.ok(plan.url.startsWith('kakaotalk://web/openExternal?url='))
    // URL 이 그대로 붙으면 쿼리스트링이 깨진다
    assert.ok(plan.url.includes(encodeURIComponent(TARGET)))
    assert.ok(!plan.url.includes('?url=https://'), '인코딩 없이 붙이면 안 된다')
  }
})

test('탈출 URL 이 원래 주소를 그대로 복원한다', () => {
  const withQuery = 'https://retro-party.example/room/ABCDEF?ref=kakao&x=1'
  const plan = planEscape(UA.kakaoIos, withQuery)
  assert.equal(plan.kind, 'auto')
  if (plan.kind !== 'auto') return
  const restored = decodeURIComponent(plan.url.split('?url=')[1] ?? '')
  assert.equal(restored, withQuery, '쿼리가 붙은 주소도 안 깨져야 한다')
})

// ── 안드로이드 · iOS ────────────────────────────────

test('안드로이드 인앱은 intent 로 크롬을 띄운다', () => {
  const plan = planEscape(UA.androidWebview, TARGET)
  assert.equal(plan.kind, 'auto')
  if (plan.kind !== 'auto') return
  assert.ok(plan.url.startsWith('intent://retro-party.example/room/ABCDEF#Intent;'))
  assert.ok(plan.url.includes('package=com.android.chrome'))
  assert.ok(!plan.url.includes('intent://https://'), '스킴을 두 번 넣으면 안 된다')
})

test('iOS 인앱은 자동으로 못 나간다 — 안내만 한다', () => {
  for (const ua of [UA.instagramIos, UA.lineIos, UA.naverIos]) {
    const plan = planEscape(ua, TARGET)
    assert.equal(plan.kind, 'guide', '되는 척하면 안 된다')
    if (plan.kind !== 'guide') return
    assert.ok(plan.hint.length > 0, '어디를 눌러야 하는지 알려줘야 한다')
  }
})

test('앱마다 다른 안내를 준다', () => {
  const insta = planEscape(UA.instagramIos, TARGET)
  const line = planEscape(UA.lineIos, TARGET)
  assert.equal(insta.kind, 'guide')
  assert.equal(line.kind, 'guide')
  if (insta.kind !== 'guide' || line.kind !== 'guide') return
  assert.notEqual(insta.hint, line.hint, '앱마다 메뉴 위치가 다르다')
})
