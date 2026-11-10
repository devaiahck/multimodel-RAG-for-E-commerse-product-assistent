import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SectionHeader from '../ui/SectionHeader'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import ProductCard, { toCardData } from '../product/ProductCard'
import { useTrending } from '../../hooks/useHomeData'

export default function HomeTrending() {
  const { data: products, isLoading, isError, error, refetch } = useTrending(8)

  if (!isLoading && !isError && (!products || products.length === 0)) {
    return null
  }

  return (
    <section
      aria-label="Trending now"
      style={{ paddingTop: '56px', paddingBottom: '56px' }}
    >
      <div className="container">
        <SectionHeader
          title="Trending now"
          action={
            <Link
              to="/category/electronics"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: 'inherit' }}
            >
              Show all <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          }
        />

        {isLoading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-lg)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  paddingBottom: 12,
                }}
              >
                <Skeleton height={160} rounded="lg" style={{ borderRadius: 0 }} />
                <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width="40%" height={10} rounded="sm" />
                  <Skeleton width="85%" height={14} rounded="sm" />
                  <Skeleton width="50%" height={16} rounded="sm" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ErrorState
              message={error ? error.message : 'Unable to load trending products.'}
              onRetry={() => refetch()}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '16px',
            }}
          >
            {products?.map((p) => (
              <ProductCard key={p.id} product={toCardData(p)} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

