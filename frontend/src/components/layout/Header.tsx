import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  ShoppingCart,
  Menu,
  ChevronDown,
  Shirt,
  Footprints,
  Watch,
  Cpu,
  Home,
  Sparkles,
  Dumbbell,
  MoreHorizontal,
} from 'lucide-react'
import MobileDrawer from './MobileDrawer'
import { useCartStore } from '../../store/cart'
import { useAuthStore } from '../../store/auth'

const NAV_LINKS = [
  { label: 'Clothing', href: '/category/clothing', Icon: Shirt },
  { label: 'Shoes', href: '/category/shoes', Icon: Footprints },
  { label: 'Watches', href: '/category/watches', Icon: Watch },
  { label: 'Electronics', href: '/category/electronics', Icon: Cpu },
  { label: 'Home', href: '/category/home', Icon: Home },
  { label: 'Beauty', href: '/category/beauty', Icon: Sparkles },
  { label: 'Sports', href: '/category/sports', Icon: Dumbbell },
  { label: 'More', href: '/category/more', Icon: MoreHorizontal },
]

export default function Header() {
  const [megaOpen, setMegaOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const megaRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const cartCount = useCartStore((s) => s.items.reduce((sum, item) => sum + item.qty, 0))
  const { user, logout } = useAuthStore()

  /* close mega menu when clicking outside */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setMegaOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <>
      <header
        style={{ backgroundColor: 'var(--ink-900)', borderBottom: '1px solid var(--border-dark)' }}
        className="sticky top-0 z-40"
      >
        <div
          className="container flex items-center justify-between"
          style={{ height: 60 }}
        >
          {/* Wordmark */}
          <Link
            to="/"
            className="wordmark"
            style={{ color: 'var(--on-dark)', textDecoration: 'none', flexShrink: 0 }}
            aria-label="UrbanPick home"
          >
            URBANPICK
          </Link>

          {/* Desktop nav */}
          <nav
            className="hidden lg:flex items-center gap-6"
            aria-label="Main navigation"
            ref={megaRef}
          >
            {NAV_LINKS.slice(0, 7).map(({ label, href }) => (
              <Link
                key={label}
                to={href}
                style={{
                  color: 'var(--on-dark-muted)',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  transition: `color var(--dur-fast) var(--ease-out)`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
              >
                {label}
              </Link>
            ))}

            {/* Categories mega trigger */}
            <button
              aria-expanded={megaOpen}
              aria-haspopup="true"
              onClick={() => setMegaOpen((o) => !o)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--on-dark-muted)',
                fontSize: '0.8rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0,
                transition: `color var(--dur-fast) var(--ease-out)`,
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--on-dark)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--on-dark-muted)'
              }}
            >
              Categories
              <ChevronDown
                size={14}
                strokeWidth={1.5}
                style={{
                  transform: megaOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: `transform var(--dur-fast) var(--ease-out)`,
                }}
              />
            </button>

            {/* Mega menu */}
            {megaOpen && (
              <div
                role="dialog"
                aria-label="All categories"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'var(--ink-800)',
                  border: '1px solid var(--border-dark)',
                  borderRadius: 'var(--r-lg)',
                  padding: '1.5rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem',
                  width: 480,
                  marginTop: '1px',
                  zIndex: 50,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                }}
              >
                {NAV_LINKS.map(({ label, href, Icon }) => (
                  <Link
                    key={label}
                    to={href}
                    onClick={() => setMegaOpen(false)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 'var(--r-md)',
                      color: 'var(--on-dark-muted)',
                      textDecoration: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      transition: `background var(--dur-fast), color var(--dur-fast)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--ink-600)'
                      e.currentTarget.style.color = 'var(--on-dark)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--on-dark-muted)'
                    }}
                  >
                    <Icon size={20} strokeWidth={1.5} />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <button
              aria-label="Open search"
              onClick={() => navigate('/search')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--on-dark-muted)',
                padding: '8px',
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                transition: `color var(--dur-fast)`,
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = 'var(--on-dark)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = 'var(--on-dark-muted)')
              }
              className="hidden sm:flex"
            >
              <Search size={18} strokeWidth={1.5} />
            </button>

            {user ? (
              <>
                <Link
                  to="/account"
                  style={{
                    color: 'var(--on-dark)',
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    padding: '6px 10px',
                    transition: `color var(--dur-fast)`,
                  }}
                  className="hidden sm:block"
                >
                  {user.name && user.name.length > 15 ? `${user.name.slice(0, 14)}…` : user.name || 'Account'}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    navigate('/')
                  }}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-dark)',
                    borderRadius: 'var(--r-pill)',
                    cursor: 'pointer',
                    color: 'var(--on-dark-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '6px 12px',
                    transition: `color var(--dur-fast), border-color var(--dur-fast)`,
                  }}
                  className="hidden sm:block"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--on-dark)'
                    e.currentTarget.style.borderColor = 'var(--on-dark)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--on-dark-muted)'
                    e.currentTarget.style.borderColor = 'var(--border-dark)'
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                {/* Sign in */}
                <Link
                  to="/login"
                  style={{
                    color: 'var(--on-dark-muted)',
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    padding: '6px 10px',
                    transition: `color var(--dur-fast)`,
                  }}
                  className="hidden sm:block"
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
                >
                  Sign in
                </Link>

                {/* Sign up pill */}
                <Link
                  to="/signup"
                  style={{
                    backgroundColor: 'var(--champagne)',
                    color: '#000000',
                    textDecoration: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '7px 14px',
                    borderRadius: 'var(--r-pill)',
                    transition: `background-color var(--dur-fast)`,
                    letterSpacing: '0.04em',
                  }}
                  className="hidden sm:block"
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--champagne-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--champagne)')}
                >
                  Sign up
                </Link>
              </>
            )}

            {/* Cart */}
            <Link
              to="/cart"
              aria-label={`Cart (${cartCount} items)`}
              style={{
                color: 'var(--on-dark-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                position: 'relative',
              }}
            >
              <ShoppingCart size={18} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    backgroundColor: 'var(--champagne)',
                    color: '#000000',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: 'var(--r-pill)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    lineHeight: 1,
                  }}
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </Link>

            {/* Hamburger – mobile ONLY (hidden on lg+) */}
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="flex lg:hidden"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--on-dark-muted)',
                padding: '8px',
              }}
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        links={NAV_LINKS}
      />
    </>
  )
}
