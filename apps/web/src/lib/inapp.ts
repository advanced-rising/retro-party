/**
 * 인앱 브라우저 탈출 — 03 문서 §6
 *
 * 유입의 주 경로가 단톡방 링크라서, 사람들은 대부분 **카카오톡 인앱 브라우저**로
 * 들어온다. 이 게임에서 그게 특히 문제인 이유는 세 가지다.
 *
 *   1. localStorage 가 격리·초기화된다 → 재접속 시 신원(playerId)이 날아가
 *      점수를 이어받지 못한다
 *   2. 웹 푸시가 안 된다 → 03 문서의 개장 알림이 통째로 죽는다
 *   3. 키보드가 올라올 때 뷰포트가 안 줄어든다 → 채팅 입력창이 가려진다.
 *      채팅이 정답 입력인 게임에서 이건 치명적이다
 *
 * 그래서 인앱이면 바깥 브라우저로 튕겨낸다. 튕겨낼 수 없는 조합(iOS + 인스타 등)은
 * 안내만 한다 — 자동으로 되는 척하면 안 된다.
 *
 * UA 문자열은 조용히 바뀌므로 이 파일은 순수 함수로만 두고 테스트한다.
 */

export type InAppKind =
  | 'kakaotalk'
  | 'naver'
  | 'line'
  | 'instagram'
  | 'facebook'
  | 'daum'
  | 'unknown-inapp'

export type Platform = 'ios' | 'android' | 'other'

const LABELS: Readonly<Record<InAppKind, string>> = {
  kakaotalk: '카카오톡',
  naver: '네이버 앱',
  line: '라인',
  instagram: '인스타그램',
  facebook: '페이스북',
  daum: '다음 앱',
  'unknown-inapp': '인앱 브라우저',
}

export function inAppLabel(kind: InAppKind): string {
  return LABELS[kind]
}

export function detectPlatform(ua: string): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

/**
 * 인앱 브라우저인지 판별한다.
 *
 * 화이트리스트가 아니라 블랙리스트인 이유: 정상 브라우저를 인앱으로 잘못 보면
 * 멀쩡한 사용자에게 배너를 띄우게 된다. 놓치는 쪽이 덜 나쁘다.
 */
export function detectInApp(ua: string): InAppKind | null {
  if (ua.length === 0) return null

  if (/kakaotalk/i.test(ua)) return 'kakaotalk'
  if (/naver\(inapp|naver\b.*\binapp|nave-?r?app/i.test(ua)) return 'naver'
  if (/\bline\//i.test(ua)) return 'line'
  if (/instagram/i.test(ua)) return 'instagram'
  if (/\bfb(an|av|_iab|ios|sv)\b|fban|fbav|fb_iab/i.test(ua)) return 'facebook'
  if (/daumapps|daumdevice/i.test(ua)) return 'daum'

  // 안드로이드 WebView 표식. Chrome 정식 앱과 구분된다
  if (/android/i.test(ua) && /; wv\)/i.test(ua)) return 'unknown-inapp'

  return null
}

export type EscapePlan =
  /** 링크 한 번으로 바깥 브라우저로 나갈 수 있다 */
  | { readonly kind: 'auto'; readonly url: string; readonly app: InAppKind }
  /** 자동으로는 못 나간다. 어디를 눌러야 하는지 알려준다 */
  | { readonly kind: 'guide'; readonly app: InAppKind; readonly hint: string }
  /** 이미 정상 브라우저 */
  | { readonly kind: 'none' }

const IOS_HINTS: Partial<Record<InAppKind, string>> = {
  instagram: '오른쪽 위 · · · 을 누르고 [외부 브라우저에서 열기] 를 선택하세요',
  facebook: '오른쪽 위 · · · 을 누르고 [외부 브라우저에서 열기] 를 선택하세요',
  line: '오른쪽 아래 화살표를 누르고 [Safari 로 열기] 를 선택하세요',
}

const DEFAULT_IOS_HINT = '오른쪽 위 메뉴에서 [다른 브라우저로 열기] 를 선택하세요'

/**
 * 지금 URL 을 바깥 브라우저에서 여는 계획을 세운다.
 *
 * @param targetUrl 절대 URL (https://…). 상대 경로면 아무 데도 못 간다
 */
export function planEscape(ua: string, targetUrl: string): EscapePlan {
  const app = detectInApp(ua)
  if (app === null) return { kind: 'none' }

  // 카카오톡은 iOS·안드로이드 둘 다 공식 스킴이 있다. 가장 흔한 경로라 제일 중요하다
  if (app === 'kakaotalk') {
    return {
      kind: 'auto',
      app,
      url: `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`,
    }
  }

  const platform = detectPlatform(ua)

  // 안드로이드는 intent 스킴으로 크롬을 직접 띄울 수 있다
  if (platform === 'android') {
    const stripped = targetUrl.replace(/^https?:\/\//, '')
    return {
      kind: 'auto',
      app,
      url: `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`,
    }
  }

  // iOS 는 앱이 막으면 방법이 없다. 안내만 한다
  return { kind: 'guide', app, hint: IOS_HINTS[app] ?? DEFAULT_IOS_HINT }
}
