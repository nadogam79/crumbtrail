// Supabase Edge Function: proxies Tmap 대중교통 API (SK Open API) so TMAP_APP_KEY
// never reaches the browser. It's GTFS-based and — unlike ODsay — returns a real
// sidewalk-following polyline for walk legs too (steps[].linestring), plus a
// road/rail-following polyline for transit legs (passShape.linestring).
//
// Deploy:  supabase functions deploy route --no-verify-jwt
// Secret:  supabase secrets set TMAP_APP_KEY=xxxx
//
// Call from the frontend as:
//   GET {SUPABASE_URL}/functions/v1/route?fromLat=..&fromLng=..&toLat=..&toLng=..
//   &mode=pedestrian 을 붙이면 대중교통 조회 없이 보행자 경로만 조회한다 (이동 중 경로 재탐지용.
//   대중교통 API는 하루 10회 한도라 재탐지에 쓰지 않는다).
//
// 대중교통 경로가 없으면(출발/도착이 너무 가까운 경우 등) Tmap 보행자 경로 API로 대체한다.
// 대중교통 조회가 한도 초과 등으로 실패해도 직선 2km 이내면 보행자 경로를 시도한다.
// 둘 다 안 되면 에러를 돌려주고, 프론트는 직선거리 추정으로 폴백한다.
//
// NOTE: field names below (sectionTime, distance, totalTime, totalDistance) follow
// Tmap's docs at https://transit.tmapmobility.com/docs/routes. sectionTime/totalTime
// are in seconds (verified against a live response — resulting walk/bus speeds came
// out realistic once divided by 60 to get minutes).

import type { TransitMode } from '../_shared/types.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TmapLeg {
  mode: string // 'WALK' | 'BUS' | 'SUBWAY' | 'EXPRESSBUS' | 'TRAIN' | ...
  route?: string
  distance?: number
  sectionTime?: number
  steps?: Array<{ linestring?: string }>
  passShape?: { linestring?: string }
}

interface TmapItinerary {
  legs: TmapLeg[]
  totalTime?: number
  totalDistance?: number
}

function parseLinestring(ls?: string): { lat: number; lng: number }[] {
  if (!ls) return []
  return ls
    .trim()
    .split(' ')
    .map((pair) => {
      const [lng, lat] = pair.split(',').map(Number)
      return { lat, lng }
    })
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
}

function normalizeMode(mode: string): TransitMode {
  if (mode === 'BUS' || mode === 'EXPRESSBUS') return 'BUS'
  if (mode === 'SUBWAY' || mode === 'TRAIN') return 'SUBWAY'
  return 'WALK'
}

function buildLegs(
  legs: TmapLeg[],
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
) {
  const rawLegs = legs.map((leg) => {
    const mode = normalizeMode(leg.mode)
    const path =
      mode === 'WALK'
        ? (leg.steps ?? []).flatMap((s) => parseLinestring(s.linestring))
        : parseLinestring(leg.passShape?.linestring)

    return {
      mode,
      label: leg.route,
      path, // may come back empty — Tmap occasionally omits steps/passShape for very short legs
      distanceMeters: leg.distance ?? 0,
      minutes: (leg.sectionTime ?? 0) / 60, // assumes sectionTime is in seconds — verified against a live response
    }
  })

  // Fill any leg that came back with no polyline by connecting the previous leg's
  // last point to the next leg's first point with a straight line, so the overall
  // route stays continuous (both for map drawing and for the deviation check).
  for (let i = 0; i < rawLegs.length; i++) {
    if (rawLegs[i].path.length > 0) continue
    const prevEnd = rawLegs[i - 1]?.path.at(-1) ?? origin
    const nextStart = rawLegs[i + 1]?.path[0] ?? destination
    rawLegs[i].path = [prevEnd, nextStart]
  }

  return rawLegs
}

// 대중교통 실패 시에도 이 거리 이내면 걸어가는 게 현실적이므로 보행자 경로를 시도한다
const PEDESTRIAN_FALLBACK_MAX_METERS = 2000

function straightDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Tmap이 호출 한도 초과로 거절한 응답인지 (HTTP 429 또는 "Limit Exceeded" 메시지)
function isQuotaExceeded(status: number, body: any) {
  return status === 429 || /limit exceeded|quota/i.test(body?.error?.message ?? '')
}

class QuotaExceededError extends Error {}

interface PedestrianFeature {
  geometry: { type: string; coordinates: number[] | number[][] }
  properties: { totalDistance?: number; totalTime?: number }
}

// Tmap 보행자 경로: GeoJSON FeatureCollection. 첫 Point feature에 totalDistance(m)/totalTime(초)가 있고,
// LineString feature들의 좌표를 이으면 인도를 따라가는 경로가 된다.
async function fetchPedestrianRoute(
  appKey: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
) {
  const res = await fetch('https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1', {
    method: 'POST',
    headers: { appKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      startX: origin.lng,
      startY: origin.lat,
      endX: destination.lng,
      endY: destination.lat,
      startName: '출발',
      endName: '도착',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
    }),
  })
  const json = await res.json()
  const features: PedestrianFeature[] = json?.features ?? []
  if (isQuotaExceeded(res.status, json)) throw new QuotaExceededError()
  if (!res.ok || features.length === 0) {
    throw new Error(json?.error?.message ?? '보행자 경로를 찾지 못했어요.')
  }

  const path = features
    .filter((f) => f.geometry.type === 'LineString')
    .flatMap((f) => (f.geometry.coordinates as number[][]).map(([lng, lat]) => ({ lat, lng })))
  const summary = features[0].properties
  const distanceMeters = summary.totalDistance ?? straightDistanceMeters(origin, destination)
  const minutes = (summary.totalTime ?? 0) / 60

  return {
    source: 'pedestrian' as const,
    legs: [{ mode: 'WALK' as TransitMode, path: path.length > 1 ? path : [origin, destination], distanceMeters, minutes }],
    totalDistanceMeters: distanceMeters,
    totalMinutes: minutes,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// 프론트가 일반 실패와 구분해 안내할 수 있도록 code를 붙인다
const quotaExceeded = () =>
  json({ error: 'TMAP 경로 검색 API의 호출 한도를 모두 사용했어요.', code: 'QUOTA_EXCEEDED' }, 429)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const url = new URL(req.url)
    const fromLat = url.searchParams.get('fromLat')
    const fromLng = url.searchParams.get('fromLng')
    const toLat = url.searchParams.get('toLat')
    const toLng = url.searchParams.get('toLng')

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return new Response(JSON.stringify({ error: 'fromLat, fromLng, toLat, toLng가 필요해요.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const appKey = Deno.env.get('TMAP_APP_KEY')
    if (!appKey) {
      return new Response(JSON.stringify({ error: 'TMAP_APP_KEY가 설정되지 않았어요.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const origin = { lat: Number(fromLat), lng: Number(fromLng) }
    const destination = { lat: Number(toLat), lng: Number(toLng) }

    if (url.searchParams.get('mode') === 'pedestrian') {
      try {
        return json(await fetchPedestrianRoute(appKey, origin, destination))
      } catch (err) {
        if (err instanceof QuotaExceededError) return quotaExceeded()
        return json({ error: err instanceof Error ? err.message : '보행자 경로를 찾지 못했어요.' }, 502)
      }
    }

    const tmapRes = await fetch('https://apis.openapi.sk.com/transit/routes', {
      method: 'POST',
      headers: { appKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        startX: fromLng,
        startY: fromLat,
        endX: toLng,
        endY: toLat,
        count: 1,
        lang: 0,
        format: 'json',
      }),
    })
    const tmapJson = await tmapRes.json()
    const itineraries: TmapItinerary[] = tmapRes.ok ? (tmapJson?.metaData?.plan?.itineraries ?? []) : []

    if (itineraries.length === 0) {
      // 경로 자체가 없으면(가까운 거리 등) 거리와 무관하게, 조회가 실패했으면 가까울 때만 보행자 경로로 대체
      const transitQuotaExceeded = isQuotaExceeded(tmapRes.status, tmapJson)
      const transitError = tmapRes.ok ? null : (tmapJson?.error?.message ?? 'Tmap 조회 실패')
      const shouldTryPedestrian =
        !transitError || straightDistanceMeters(origin, destination) <= PEDESTRIAN_FALLBACK_MAX_METERS
      if (shouldTryPedestrian) {
        try {
          return json(await fetchPedestrianRoute(appKey, origin, destination))
        } catch (err) {
          if (err instanceof QuotaExceededError) return quotaExceeded()
          return json({ error: err instanceof Error ? err.message : '보행자 경로를 찾지 못했어요.' }, 502)
        }
      }
      if (transitQuotaExceeded) return quotaExceeded()
      return json({ error: transitError }, 502)
    }

    const itinerary = itineraries[0]
    const legs = buildLegs(itinerary.legs, origin, destination)

    const totalDistanceMeters = itinerary.totalDistance ?? legs.reduce((sum, l) => sum + l.distanceMeters, 0)
    const totalMinutes = itinerary.totalTime != null ? itinerary.totalTime / 60 : legs.reduce((sum, l) => sum + l.minutes, 0)

    return json({ source: 'transit', legs, totalDistanceMeters, totalMinutes })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : '알 수 없는 오류' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
