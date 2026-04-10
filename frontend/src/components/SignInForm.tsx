import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function SignInForm() {
  const { signInWithGoogle, signInWithEmail, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Redirect if already signed in
  if (user) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-0">
      <div className="w-full max-w-sm p-8 bg-surface-1 rounded-lg border border-subtle">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">Gweebler</h1>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2 px-4 bg-white text-gray-800 rounded font-medium hover:bg-gray-100 disabled:opacity-50 mb-4"
        >
          Sign in with Google
        </button>

        <div className="flex items-center my-4">
          <hr className="flex-1 border-subtle" />
          <span className="px-3 text-muted text-sm">or</span>
          <hr className="flex-1 border-subtle" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded text-primary placeholder:text-muted"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded text-primary placeholder:text-muted"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-accent text-white rounded font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Sign in
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-danger text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
