// 이상 신호 경보가 울릴 때 사용자에게 주는 효과: 진동, 경고음, 시스템 알림.
// 진동/경고음은 계정 메뉴에서 켜고 끌 수 있고, 이 브라우저에만 기억한다.

export interface AlertEffectPrefs {
  vibrate: boolean
  sound: boolean
}

const PREFS_KEY = 'crumbtrail.alertEffects'
const DEFAULT_PREFS: AlertEffectPrefs = { vibrate: true, sound: true }

export function getAlertEffectPrefs(): AlertEffectPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return { ...DEFAULT_PREFS, ...saved }
  } catch {
    return DEFAULT_PREFS
  }
}

export function setAlertEffectPrefs(prefs: AlertEffectPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 저장 실패 시 기본값(모두 켬)으로 돌아갈 뿐이므로 무시
  }
}

// 짧게 끊어 세 번, 길게 한 번. 안드로이드 Chrome에서만 동작한다(iPhone Safari는 미지원).
const VIBRATION_PATTERN = [400, 150, 400, 150, 400, 300, 900]

let audioContext: AudioContext | null = null

// 브라우저는 사용자 조작 없이 소리/알림 권한을 열어주지 않는다.
// 이동 시작 버튼을 누를 때 불러서 경보 때 바로 쓸 수 있게 준비해둔다.
export function prepareAlertEffects() {
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    audioContext = null
  }
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  // 안드로이드 Chrome은 new Notification()을 막고 서비스 워커로만 알림을 띄울 수 있다
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}

// 높낮이를 번갈아 내는 사이렌 비슷한 경고음 (약 1.6초)
function playAlarm() {
  const ctx = audioContext
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const start = ctx.currentTime
  for (let i = 0; i < 4; i++) {
    const t = start + i * 0.4
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.36)
  }
}

async function showSystemNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag: 'crumbtrail-alert', requireInteraction: true, icon: '/favicon.svg' }
  try {
    // 서비스 워커를 못 쓰는 환경이면 getRegistration()이 예외를 던지므로 페이지 알림으로 넘어간다
    const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
    if (registration) {
      await registration.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch {
    // 알림을 못 띄워도 앱 안 배너와 발송은 그대로 동작한다
  }
}

export function fireAlertEffects(title: string, body: string) {
  const prefs = getAlertEffectPrefs()
  if (prefs.vibrate && 'vibrate' in navigator) navigator.vibrate(VIBRATION_PATTERN)
  if (prefs.sound) playAlarm()
  void showSystemNotification(title, body)
}
