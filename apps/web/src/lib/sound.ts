'use client'

/**
 * 소리 — 06 문서 §9
 *
 * ## 왜 파일을 안 쓰는가
 *
 * 효과음 파일을 받아 오면 라이선스를 따져야 하고, 첫 로딩이 무거워지고,
 * 캐시가 안 되면 정작 필요한 순간에 안 난다. 이 게임에 필요한 소리는
 * **짧은 신호음 대여섯 개**뿐이라 브라우저가 직접 만들면 된다 —
 * 파일 0바이트, 라이선스 0, 지연 0 이다.
 *
 * ## 언제 나는가
 *
 * 채팅이 빠르게 흐르는 게임이라 화면을 계속 볼 수 없다. **소리가
 * 「지금 뭔가 일어났다」를 알려주는 유일한 통로**인 순간이 있다 —
 * 정답, 라운드 시작, 시간이 얼마 안 남았을 때.
 *
 * 반대로 소리를 남발하면 음소거를 누르게 되고, 그러면 위의 셋도 같이 죽는다.
 * 그래서 **오답에는 소리를 넣지 않는다.** 틀리는 건 자주 일어난다.
 */

const PREF_KEY = 'retro:sound'

export type Cue = 'correct' | 'reveal' | 'start' | 'tick' | 'join'

interface Tone {
  /** 주파수(Hz) 순서대로 이어 낸다 */
  readonly steps: readonly number[]
  readonly stepMs: number
  readonly gain: number
  readonly type: OscillatorType
}

/**
 * 음정은 오음계에서 골랐다. 어떤 순서로 겹쳐 나도 불협이 안 난다 —
 * 여러 사람이 동시에 맞히면 소리가 겹치기 때문이다.
 */
const TONES: Readonly<Record<Cue, Tone>> = {
  // 올라가는 두 음 — 「됐다」
  correct: { steps: [660, 880], stepMs: 90, gain: 0.16, type: 'triangle' },
  // 내려앉는 세 음 — 「끝났다」
  reveal: { steps: [587, 494, 392], stepMs: 110, gain: 0.13, type: 'sine' },
  // 셋을 세고 출발
  start: { steps: [440, 554, 659], stepMs: 120, gain: 0.15, type: 'triangle' },
  // 초읽기. 아주 짧고 작게
  tick: { steps: [880], stepMs: 55, gain: 0.07, type: 'square' },
  // 누가 들어왔다
  join: { steps: [523, 784], stepMs: 70, gain: 0.09, type: 'sine' },
}

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (context !== null) return context
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (Ctor === undefined) return null
  context = new Ctor()
  return context
}

export function soundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(PREF_KEY) !== 'off'
}

export function setSoundEnabled(on: boolean): void {
  localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  // 켜는 순간이 사용자 조작이라, 여기서 컨텍스트를 깨워 둔다.
  // 브라우저는 조작 없이 시작된 오디오를 막는다
  if (on) void audio()?.resume()
}

export function play(cue: Cue): void {
  if (!soundEnabled()) return
  const ctx = audio()
  if (ctx === null) return
  if (ctx.state === 'suspended') void ctx.resume()

  const tone = TONES[cue]
  const start = ctx.currentTime

  tone.steps.forEach((frequency, i) => {
    const at = start + (i * tone.stepMs) / 1000
    const until = at + tone.stepMs / 1000

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = tone.type
    osc.frequency.setValueAtTime(frequency, at)

    // 딱 끊으면 「틱」 하는 잡음이 난다. 끝을 부드럽게 내린다
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(tone.gain, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, until)

    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(until + 0.02)
  })
}
