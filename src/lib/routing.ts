import type { Coordinate, RouteResult } from '../types'

// Calls the Supabase Edge Function that proxies ODsay (see supabase/functions/route).
// No supabase-js needed — it's a plain HTTPS endpoint guarded by the anon key.
export async function fetchRoute(origin: Coordinate, destination: Coordinate): Promise<RouteResult> {
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

  const res = await fetch(`${supabaseUrl}/functions/v1/route?${params}`, {
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error ?? '경로를 불러오지 못했어요.')
  }
  return json as RouteResult
}
