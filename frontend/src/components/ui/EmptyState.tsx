import type { ReactNode } from 'react'
import { PackageSearch } from 'lucide-react'

interface Props {
  title: string
  message?: string
  suggestions?: string[]
  children?: ReactNode
}

export default function EmptyState({ title, message, suggestions, children }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        backgroundColor: 'var(--card)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)',
        maxWidth: 540,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--r-pill)',
          backgroundColor: 'var(--tile)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          color: 'var(--champagne-deep)',
        }}
      >
        <PackageSearch size={28} strokeWidth={1.5} />
      </div>

      <h3
        style={{
          margin: '0 0 8px 0',
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--text)',
          fontFamily: 'Bodoni Moda, serif',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>

      {message && (
        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '0.9rem',
            color: 'var(--text-muted)',
            fontFamily: 'Manrope, sans-serif',
            lineHeight: 1.5,
            maxWidth: 420,
          }}
        >
          {message}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div
          style={{
            marginTop: 8,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              fontFamily: 'Manrope, sans-serif',
            }}
          >
            Suggestions
          </span>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {suggestions.map((suggestion, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text)',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                • {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children && (
        <div style={{ marginTop: 20 }}>
          {children}
        </div>
      )}
    </div>
  )
}

