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
  // 진행 중인 로딩을 먼저 기다린다: 스크립트 onload 직후 kakao.maps.load 콜백 전까지는
  // window.kakao.maps가 있어도 LatLng 등이 아직 없어서 바로 쓰면 깨진다.
  if (loadPromise) return loadPromise
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao)

  const appkey = import.meta.env.VITE_KAKAO_JS_KEY
  if (!appkey) {
    return Promise.reject(new Error('카카오맵 키가 설정되지 않았어요. .env.local에 VITE_KAKAO_JS_KEY를 추가해주세요.'))
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
