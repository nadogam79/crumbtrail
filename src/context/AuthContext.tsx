import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { handleToEmail, supabase } from '../lib/supabase'
import type { Profile } from '../lib/messenger'

interface AuthContextValue {
  loading: boolean
  // 가입 시 user_metadata에 넣은 handle/name을 그대로 쓴다 (profiles 테이블과 동일한 값)
  profile: Profile | null
  signIn: (handle: string, password: string) => Promise<void>
  signUp: (name: string, handle: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ERROR_LABEL: Record<string, string> = {
  'Invalid login credentials': '아이디 또는 비밀번호가 틀렸어요.',
  'User already registered': '이미 사용 중인 아이디예요.',
}

function toKoreanError(message: string) {
  if (message.startsWith('Password should be')) return '비밀번호는 6자 이상이어야 해요.'
  return ERROR_LABEL[message] ?? message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const meta = session?.user.user_metadata
    return {
      loading,
      profile: session && meta ? { id: session.user.id, handle: meta.handle, name: meta.name } : null,
      signIn: async (handle, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: handleToEmail(handle), password })
        if (error) throw new Error(toKoreanError(error.message))
      },
      signUp: async (name, handle, password) => {
        const { error } = await supabase.auth.signUp({
          email: handleToEmail(handle),
          password,
          options: { data: { handle, name } },
        })
        if (error) throw new Error(toKoreanError(error.message))
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }
  }, [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
