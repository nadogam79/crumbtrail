import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !anonKey) {
  throw new Error('Supabase 설정이 없어요. .env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 추가해주세요.')
}

export const supabase = createClient(supabaseUrl, anonKey)

// 이메일 인증 없이 아이디/비밀번호로만 쓰기 위해 아이디를 내부 전용 이메일로 변환한다.
export const handleToEmail = (handle: string) => `${handle}@crumbtrail.local`

export const HANDLE_PATTERN = /^[a-z0-9_]{4,20}$/
