import { Link } from 'react-router-dom'
import Skeleton from '../ui/Skeleton'
import { useCategories, getCategoryIcon } from '../../hooks/useHomeData'

export default function HomeCategories() {
  const { data: categories, isLoading } = useCategories()

  return (
    <section
      aria-label="Browse categories"
      style={{
        backgroundColor: 'var(--paper)',
        marginTop: '-48px',
        paddingBottom: '0',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-lg)',
                    padding: '24px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <Skeleton width={32} height={32} rounded="full" />
                  <Skeleton width="60%" height={14} rounded="sm" />
                </div>
              ))
            : categories?.map(({ label, slug }) => {
                const Icon = getCategoryIcon(slug)
                return (
                  <Link
                    key={slug}
                    to={`/category/${slug}`}
                    aria-label={`Browse ${label}`}
                    style={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-lg)',
                      padding: '24px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      textDecoration: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                      transition: `transform var(--dur-mid) var(--ease-out), color var(--dur-fast)`,
                      textAlign: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.color = 'var(--champagne-deep)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }}
                  >
                    <Icon size={28} strokeWidth={1.5} />
                    {label}
                  </Link>
                )
              })}
        </div>
      </div>
    </section>
  )
}

