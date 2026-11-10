import { useNavigate } from 'react-router-dom'
import { BarChart2, ExternalLink, Zap } from 'lucide-react'
import SearchBar from '../components/search/SearchBar'
import Chip from '../components/ui/Chip'
import HomeCategories from '../components/home/HomeCategories'
import HomeRecommendations from '../components/home/HomeRecommendations'
import HomeFeatured from '../components/home/HomeFeatured'
import HomeTrending from '../components/home/HomeTrending'
import { useCategories } from '../hooks/useHomeData'

const DEFAULT_CHIPS = [
  { label: 'Clothing', slug: 'clothing' },
  { label: 'Shoes', slug: 'shoes' },
  { label: 'Watches', slug: 'watches' },
  { label: 'Electronics', slug: 'electronics' },
  { label: 'Home', slug: 'home' },
  { label: 'Beauty', slug: 'beauty' },
]

const TRUST = [
  { Icon: BarChart2, label: 'Compare store prices' },
  { Icon: BarChart2, label: 'Price history' },
  { Icon: ExternalLink, label: 'Direct links to stores' },
  { Icon: Zap, label: 'Smart recommendations' },
]

export default function Home() {
  const navigate = useNavigate()
  const { data: categories } = useCategories()

  const chips = categories && categories.length > 0
    ? categories.slice(0, 6)
    : DEFAULT_CHIPS

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section
        style={{ backgroundColor: 'var(--ink-900)', paddingBottom: '80px' }}
        aria-label="Hero"
      >
        <div className="container" style={{ paddingTop: '80px', textAlign: 'center' }}>
          <p
            className="eyebrow"
            style={{
              color: 'var(--champagne)',
              marginBottom: '1rem',
              letterSpacing: '0.22em',
            }}
          >
            Ask. Show. Discover.
          </p>

          <h1
            className="font-display"
            style={{
              color: 'var(--on-dark)',
              fontSize: 'clamp(2.4rem, 5.5vw, 4rem)',
              lineHeight: 1.1,
              fontWeight: 400,
              marginBottom: '2.5rem',
            }}
          >
            The whole market, one smart search.
          </h1>

          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <SearchBar dark />
          </div>

          {/* Category chips – navigate to /category/{slug} */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: '1.25rem',
              justifyContent: 'center',
            }}
          >
            {chips.map((chip) => (
              <Chip
                key={chip.slug}
                dark
                onClick={() => navigate(`/category/${chip.slug}`)}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      {/* ── Category cards ─────────────────────────────────────────── */}
      <HomeCategories />

      {/* ── Personalized recommendations / Good deals ─────────────── */}
      <HomeRecommendations />

      {/* ── Featured collection ─────────────────────────────────────── */}
      <HomeFeatured />

      {/* ── Trending now ─────────────────────────────────────────── */}
      <HomeTrending />

      {/* ── Trust row ────────────────────────────────────────────── */}
      <section
        style={{
          backgroundColor: 'var(--paper)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          padding: '32px 0',
        }}
        aria-label="Why UrbanPick"
      >
        <div
          className="container"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px',
          }}
        >
          {TRUST.map(({ Icon, label }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--r-pill)',
                  backgroundColor: 'var(--tile)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--champagne-deep)',
                }}
              >
                <Icon size={20} strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)' }}>{label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
