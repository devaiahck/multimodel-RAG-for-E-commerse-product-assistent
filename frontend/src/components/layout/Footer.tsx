import { Link } from 'react-router-dom'

const SHOP_LINKS = [
  { label: 'Clothing', href: '/category/clothing' },
  { label: 'Shoes', href: '/category/shoes' },
  { label: 'Watches', href: '/category/watches' },
  { label: 'Price history', href: '/insights' },
  { label: 'Budget planner', href: '/budget' },
  { label: "It's on sale", href: '/search?q=sale' },
]

const HELP_LINKS = [
  { label: 'About', href: '/about' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Blog', href: '/blog' },
  { label: 'Contact', href: '/contact' },
]

const COMPANY_LINKS = [
  { label: 'About us', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Terms', href: '/terms' },
]

export default function Footer() {
  const isDemoData = import.meta.env.VITE_DEMO_DATA !== 'false'

  return (
    <footer
      style={{
        backgroundColor: 'var(--ink-900)',
        borderTop: '1px solid var(--border-dark)',
        color: 'var(--on-dark-muted)',
        fontFamily: 'Manrope, sans-serif',
      }}
    >
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        {/* Top row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr repeat(3, auto)',
            gap: '2.5rem',
            alignItems: 'start',
          }}
        >
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="wordmark"
              style={{
                color: 'var(--on-dark)',
                textDecoration: 'none',
                display: 'inline-block',
                marginBottom: '0.75rem',
              }}
            >
              URBANPICK
            </Link>
            <p style={{ fontSize: '0.8rem', lineHeight: 1.7, maxWidth: 240, color: 'var(--on-dark-secondary)' }}>
              UrbanPick helps you discover products with verified price confidence.
            </p>
            {isDemoData && (
              <p style={{ fontSize: '0.72rem', color: 'var(--champagne)', marginTop: '8px' }}>
                Prices and price history shown are demo data.
              </p>
            )}
          </div>

          {/* Shop */}
          <div>
            <p
              className="eyebrow"
              style={{ color: 'var(--on-dark)', marginBottom: '1rem', fontSize: '0.7rem' }}
            >
              Shop
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {SHOP_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    to={href}
                    style={{
                      color: 'var(--on-dark-muted)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      transition: 'color var(--dur-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <p
              className="eyebrow"
              style={{ color: 'var(--on-dark)', marginBottom: '1rem', fontSize: '0.7rem' }}
            >
              Help
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {HELP_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    to={href}
                    style={{
                      color: 'var(--on-dark-muted)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      transition: 'color var(--dur-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p
              className="eyebrow"
              style={{ color: 'var(--on-dark)', marginBottom: '1rem', fontSize: '0.7rem' }}
            >
              Company
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {COMPANY_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    to={href}
                    style={{
                      color: 'var(--on-dark-muted)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                      transition: 'color var(--dur-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-dark)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-dark-muted)')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: '1px solid var(--border-dark)',
            marginTop: '2.5rem',
            paddingTop: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--on-dark-muted)' }}>
              © UrbanPick
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--on-dark-muted)' }}>
              Photos by{' '}
              <a
                href="https://www.pexels.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--champagne)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--champagne-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--champagne)')}
              >
                Pexels
              </a>
            </p>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--on-dark-muted)', maxWidth: 480, textAlign: 'right' }}>
            UrbanPick doesn't sell products. We compare and link to stores. Prices and availability may vary.
          </p>
        </div>
      </div>
    </footer>
  )
}
