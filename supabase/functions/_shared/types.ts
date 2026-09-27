// Duplicated from src/types/index.ts on purpose: Edge Functions run on Deno and
// aren't part of the Vite/tsc build, so they don't share a module graph with src/.
export type TransitMode = 'WALK' | 'BUS' | 'SUBWAY'
