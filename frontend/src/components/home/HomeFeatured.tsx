import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import SectionHeader from '../ui/SectionHeader'
import Skeleton from '../ui/Skeleton'
import ErrorState from '../ui/ErrorState'
import ProductCard, { toCardData } from '../product/ProductCard'
import { useCategories, useFeaturedCollection, getCategoryIcon } from '../../hooks/useHomeData'

export default function HomeFeatured() {
  const { data: categories } = useCategories()
  // Derive featured category dynamically from catalog categories
  const activeCategory = categories && categories.length > 0 ? categories[0] : null
  const categorySlug = activeCategory ? activeCategory.slug : ''
  const categoryName = activeCategory ? activeCategory.label : 'Featured'

  const { data: products, isLoading, isError, error, refetch } = useFeaturedCollection(categorySlug, 4)

  if (!categorySlug || (!isLoading && !isError && (!products || products.length === 0))) {
    return null
  }

  const CategoryIcon = getCategoryIcon(categorySlug)

  return (
    <section
      aria-label="Featured collection"
      style={{ paddingTop: '56px', paddingBottom: '56px', backgroundColor: 'var(--paper)' }}
    >
      <div className="container">
        <SectionHeader
          title={`Featured in ${categoryName}`}
          action={
            <Link
              to={`/category/${categorySlug}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: 'inherit' }}
            >
              Shop {categoryName.toLowerCase()} <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          }
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 3fr',
            gap: '16px',
            alignItems: 'stretch',
          }}
        >
          {/* Left: feature banner tile */}
          <div
            style={{
              backgroundColor: 'var(--tile)',
              borderRadius: 'var(--r-xl)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '32px 24px',
              border: '1px solid var(--line)',
              minHeight: 360,
            }}
          >
            <CategoryIcon size={64} strokeWidth={1} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: '24px' }} />
            <p
              className="font-display"
              style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 400, textAlign: 'center' }}
            >
              Curated selection
            </p>
          </div>

          {/* Right: 2x2 product cards or skeleton */}
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {Array.from({ length: 4 }).map((_, i) => (
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
                  <Skeleton height={140} rounded="lg" style={{ borderRadius: 0 }} />
                  <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="40%" height={10} rounded="sm" />
                    <Skeleton width="80%" height={14} rounded="sm" />
                    <Skeleton width="50%" height={16} rounded="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ErrorState
                message={error ? error.message : 'Unable to load featured collection.'}
                onRetry={() => refetch()}
              />
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
              }}
            >
              {products?.map((p) => (
                <ProductCard key={p.id} product={toCardData(p)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
