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

    if (!tmapRes.ok) {
      return new Response(JSON.stringify({ error: tmapJson?.error?.message ?? 'Tmap 조회 실패' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const itineraries: TmapItinerary[] = tmapJson?.metaData?.plan?.itineraries ?? []
    if (itineraries.length === 0) {
      return new Response(JSON.stringify({ error: '추천 경로를 찾지 못했어요.' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const itinerary = itineraries[0]
    const legs = buildLegs(
      itinerary.legs,
      { lat: Number(fromLat), lng: Number(fromLng) },
      { lat: Number(toLat), lng: Number(toLng) },
    )

    const totalDistanceMeters = itinerary.totalDistance ?? legs.reduce((sum, l) => sum + l.distanceMeters, 0)
    const totalMinutes = itinerary.totalTime != null ? itinerary.totalTime / 60 : legs.reduce((sum, l) => sum + l.minutes, 0)

    return new Response(JSON.stringify({ legs, totalDistanceMeters, totalMinutes }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : '알 수 없는 오류' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
