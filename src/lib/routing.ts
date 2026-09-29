import type { Coordinate, RouteResult } from '../types'

// 경로 조회 실패. code가 QUOTA_EXCEEDED면 TMAP 호출 한도를 다 쓴 것이라 재시도해도 소용없다.
export class RouteError extends Error {
  code?: 'QUOTA_EXCEEDED'

  constructor(message: string, code?: 'QUOTA_EXCEEDED') {
    super(message)
    this.code = code
  }
}

// Calls the Supabase Edge Function that proxies Tmap (see supabase/functions/route).
// No supabase-js needed — it's a plain HTTPS endpoint guarded by the anon key.
// pedestrianOnly: 대중교통 조회 없이 보행자 경로만 받는다 (이동 중 경로 재탐지용)
export async function fetchRoute(
  origin: Coordinate,
  destination: Coordinate,
  { pedestrianOnly = false }: { pedestrianOnly?: boolean } = {},
): Promise<RouteResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase 설정이 없어요. .env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 추가해주세요.')
  }

  const params = new URLSearchParams({
    fromLat: String(origin.lat),
    fromLng: String(origin.lng),
    toLat: String(destination.lat),
    toLng: String(destination.lng),
  })
  if (pedestrianOnly) params.set('mode', 'pedestrian')

  const res = await fetch(`${supabaseUrl}/functions/v1/route?${params}`, {
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  })

  const json = await res.json()
  if (!res.ok) {
    throw new RouteError(json.error ?? '경로를 불러오지 못했어요.', json.code)
  }
  return json as RouteResult
}
