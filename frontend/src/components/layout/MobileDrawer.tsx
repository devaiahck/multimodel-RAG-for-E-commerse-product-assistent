import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { X, User as UserIcon, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

interface NavLink {
  label: string
  href: string
  Icon: LucideIcon
}

interface Props {
  open: boolean
  onClose: () => void
  links: NavLink[]
}

export default function MobileDrawer({ open, onClose, links }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuthStore()

  /* trap focus and close on Escape */
  useEffect(() => {
    if (!open) return
    const el = dialogRef.current
    el?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 300,
          backgroundColor: 'var(--ink-800)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          overflowY: 'auto',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: '2rem' }}
        >
          <span className="wordmark" style={{ color: 'var(--on-dark)' }}>
            URBANPICK
          </span>
          <button
            aria-label="Close menu"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--on-dark-muted)',
              padding: '4px',
            }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Category links */}
        <nav aria-label="Mobile navigation">
          {links.map(({ label, href, Icon }) => (
            <Link
              key={label}
              to={href}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 0',
                borderBottom: '1px solid var(--ink-600)',
                color: 'var(--on-dark-muted)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Auth links */}
        <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {user ? (
            <>
              <Link
                to="/account"
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  backgroundColor: 'var(--champagne)',
                  color: 'var(--ink-900)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                <UserIcon size={16} />
                <span>{user.name || 'Account'}</span>
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await logout()
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--ink-500)',
                  background: 'none',
                  color: 'var(--on-dark-muted)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link
                to="/login"
                onClick={onClose}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--ink-500)',
                  color: 'var(--on-dark)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                onClick={onClose}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px',
                  borderRadius: 'var(--r-pill)',
                  backgroundColor: 'var(--champagne)',
                  color: 'var(--ink-900)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
