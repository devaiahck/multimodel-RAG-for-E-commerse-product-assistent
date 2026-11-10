import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
}

/**
 * Full-screen black auth layout shared by Login and Signup.
 *
 * Animations (CSS only, respects prefers-reduced-motion):
 *   a) Card fades in and rises 16px over 0.6s
 *   b) A thin gold "lightning" light sweeps diagonally across the page
 *      once on load, then loops every 6s
 *   c) A faint gold light runs once around the card border on open
 */
export default function AuthLayout({ children }: Props) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Lightning sweep – fires once on load, then loops every 6s */}
      <div className="auth-page-sweep" aria-hidden="true" />
      <div className="auth-page-sweep-loop" aria-hidden="true" />

      {/* Wordmark above the card */}
      <Link
        to="/"
        className="wordmark"
        style={{
          color: '#ffffff',
          textDecoration: 'none',
          marginBottom: '2rem',
          position: 'relative',
          zIndex: 1,
        }}
        aria-label="UrbanPick home"
      >
        URBANPICK
      </Link>

      {/* Card */}
      <div
        className="auth-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          backgroundColor: 'var(--ink-800)',
          border: '1px solid var(--border-dark)',
          boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7)',
          borderRadius: 'var(--r-lg)',
          padding: '28px 24px',
          zIndex: 1,
        }}
      >
        {/* Border glow – runs once on open */}
        <div className="auth-border-glow" aria-hidden="true" />

        {children}
      </div>
    </div>
  )
}
