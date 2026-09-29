# 🍞 실종빵프로맵

귀가 중 이상이 감지되면 지정한 친구에게 자동으로 알려주는 안전 귀가 서비스.
헨젤과 그레텔이 흘린 빵 조각처럼, 이동 경로를 기록하다가 이상이 생기면 비상 연락망에 위치를 보냅니다.

**배포**: https://crumbtrail-ruby.vercel.app

## 사용법

1. **친구 추가 · 비상 연락망** — 메신저 > 친구에서 친구를 추가하고 '비상 연락망'을 체크합니다. 경찰은 기본으로 포함됩니다.
2. **목적지 설정** — 목적지를 검색하거나 지도에서 고른 뒤 '이동 시작'을 누릅니다.
3. **이동 중** — 지도에 경로와 빵 조각(🍞)이 표시되고, 지나온 빵 조각은 회색으로 바뀝니다.
4. **이상 감지** — 경로 이탈, 장시간 정지, 도착 지연이 감지되면 경보가 울립니다. 30초 안에 '나 괜찮아'를 누르지 않으면 비상 연락망과 경찰에게 현재 위치를 보냅니다.
5. **해제 · 도착** — 오작동이면 '나 괜찮아', 도착하면 '도착했어요'를 누릅니다.

> 위치 추적은 앱 화면이 켜져 있는 동안에만 동작합니다.

## 기술 스택

- **Frontend**: React 19, TypeScript, Vite, Kakao Maps SDK
- **Backend**: Supabase (Auth, Postgres + RLS, Edge Functions)
- **경로 조회**: TMAP 대중교통 / 보행자 API (Edge Function 경유)
- **배포**: Vercel

## 로컬 실행

`.env.local`에 아래 값을 넣고 실행합니다.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_KAKAO_JS_KEY=
```

```bash
npm install
npm run dev
```
