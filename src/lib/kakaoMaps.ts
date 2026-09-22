declare global {
  interface Window {
    kakao: any
  }
}

const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js'

let loadPromise: Promise<any> | null = null

// Loads the Kakao Maps JavaScript API once and resolves with the global `kakao`
// object after `kakao.maps.load` fires (autoload=false avoids a render race on init).
export function loadKakaoMaps(): Promise<any> {
  if (window.kakao?.maps) return Promise.resolve(window.kakao)
  if (loadPromise) return loadPromise

  const appkey = import.meta.env.VITE_KAKAO_JS_KEY
  if (!appkey) {
    return Promise.reject(
      new Error('카카오맵 키가 설정되지 않았어요. .env.local에 VITE_KAKAO_JS_KEY를 추가해주세요.'),
    )
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${SDK_URL}?appkey=${appkey}&autoload=false&libraries=services`
    script.async = true
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao))
    script.onerror = () => reject(new Error('카카오맵 스크립트를 불러오지 못했어요.'))
    document.head.appendChild(script)
  })

  return loadPromise
}
