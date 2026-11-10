import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/layout/AuthLayout'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: any) {
      if (err?.kind === 'rate_limit') {
        setError('Too many failed attempts. Please wait 15 minutes before trying again.')
      } else if (err?.status === 400 || err?.kind === 'bad_request') {
        setError(err.message || 'Incorrect email or password.')
      } else {
        setError(err?.message || 'Unable to sign in. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      {/* Heading */}
      <h1
        className="font-display"
        style={{
          color: 'var(--on-dark)',
          fontSize: '1.75rem',
          fontWeight: 400,
          marginBottom: '1.25rem',
          textAlign: 'center',
        }}
      >
        Welcome back
      </h1>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        noValidate
      >
        <Input
          id="login-email"
          label="EMAIL ADDRESS"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          dark
          required
          style={{ minHeight: 48 }}
        />

        <div style={{ position: 'relative' }}>
          <Input
            id="login-password"
            label="PASSWORD"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            dark
            required
            style={{ paddingRight: '44px', minHeight: 48 }}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((s) => !s)}
            style={{
              position: 'absolute',
              right: '12px',
              bottom: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#a1a1aa',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
          </button>
        </div>

        {error && (
          <p role="alert" style={{ color: 'var(--verdict-wait)', fontSize: '0.8rem', textAlign: 'center' }}>
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary-dark"
          fullWidth
          disabled={loading}
          style={{
            marginTop: '4px',
            letterSpacing: '0.12em',
            minHeight: 44,
          }}
        >
          {loading ? 'Signing in…' : 'SIGN IN'}
        </Button>
      </form>

      {/* Footer links */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '1rem',
        }}
      >
        <Link
          to="/forgot-password"
          style={{ color: 'var(--on-dark-muted)', fontSize: '0.78rem', textDecoration: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
        >
          Forgot password?
        </Link>
        <Link
          to="/signup"
          style={{ color: 'var(--champagne)', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--champagne-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--champagne)')}
        >
          Don't have an account? Sign up
        </Link>
      </div>
    </AuthLayout>
  )
}
