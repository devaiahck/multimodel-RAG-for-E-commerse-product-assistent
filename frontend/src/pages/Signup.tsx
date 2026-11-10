import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/layout/AuthLayout'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/auth'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const signup = useAuthStore((s) => s.signup)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name || !email || !password || !confirm) {
      setError('Please fill in all fields.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await signup(name, email, password)
      navigate('/')
    } catch (err: any) {
      if (err?.kind === 'rate_limit') {
        setError('Too many signup attempts. Please try again later.')
      } else if (err?.status === 400 || err?.kind === 'bad_request') {
        setError(err.message || 'An account with this email already exists.')
      } else {
        setError(err?.message || 'Could not create account. Please try again.')
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
        Create account
      </h1>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        noValidate
      >
        <Input
          id="signup-name"
          label="FULL NAME"
          type="text"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          dark
          required
          style={{ minHeight: 48 }}
        />
        <Input
          id="signup-email"
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
            id="signup-password"
            label="PASSWORD"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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

        <Input
          id="signup-confirm"
          label="CONFIRM PASSWORD"
          type={showPassword ? 'text' : 'password'}
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          dark
          required
          style={{ minHeight: 48 }}
        />

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
          {loading ? 'Creating account…' : 'CREATE ACCOUNT'}
        </Button>
      </form>

      {/* Footer links */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '1rem',
        }}
      >
        <Link
          to="/login"
          style={{ color: 'var(--champagne)', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--champagne-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--champagne)')}
        >
          Already have an account? Sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
