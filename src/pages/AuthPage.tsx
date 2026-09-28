import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { HANDLE_PATTERN } from '../lib/supabase'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const normalized = handle.trim().toLowerCase()
    if (mode === 'signup' && !HANDLE_PATTERN.test(normalized)) {
      setError('아이디는 영문 소문자, 숫자, _ 조합 4~20자로 입력해주세요.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'signin') await signIn(normalized, password)
      else await signUp(name.trim(), normalized, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="page auth-page">
          <div className="auth-brand">
            <h1>🍞 CrumbTrail</h1>
            <p>{mode === 'signin' ? '안전한 귀가를 함께 지켜요.' : '이름과 아이디만으로 가입할 수 있어요.'}</p>
          </div>
          <section className="card">
            <form className="form" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <label className="field">
                  <span>이름</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
                </label>
              )}
              <label className="field">
                <span>아이디</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </label>
              {error && <p className="warning-text">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {mode === 'signin' ? '로그인' : '가입하기'}
              </button>
            </form>
            <button type="button" className="btn-text auth-switch" onClick={switchMode}>
              {mode === 'signin' ? '처음이에요 (가입)' : '이미 계정이 있어요 (로그인)'}
            </button>
          </section>
        </div>
      </main>
    </div>
  )
}
