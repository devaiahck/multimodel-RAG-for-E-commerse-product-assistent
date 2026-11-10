import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import SectionHeader from '../ui/SectionHeader'
import Skeleton from '../ui/Skeleton'
import ProductCard, { toCardData } from '../product/ProductCard'
import { useAuthStore } from '../../store/auth'
import { fetchUserRecommendations } from '../../api/auth'
import { listProducts } from '../../api/products'
import { computeBuyScore, computeRealDiscount } from '../../lib/priceInsight'
import type { Product } from '../../api/types'

export default function HomeRecommendations() {
  const user = useAuthStore((s) => s.user)

  // 1. Fetch recommendations if logged in
  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ['me', 'recommendations', user?.id],
    queryFn: () => fetchUserRecommendations(8),
    enabled: Boolean(user),
    staleTime: 0,
  })

  // 2. Fetch catalog products to build "Good deals right now" (cached so it's instant)
  const { data: productsData, isLoading: dealsLoading } = useQuery({
    queryKey: ['good-deals-catalog'],
    queryFn: () => listProducts({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
  })

  // Filter & rank good deals: buy score >= 70 and genuine real discount
  const goodDeals = useMemo<Product[]>(() => {
    if (!productsData?.items) return []
    const candidates = productsData.items.map((p) => {
      const hist = Array.isArray(p.price_history) ? p.price_history : []
      const bs = computeBuyScore(hist, p.price).score
      const rd = p.original_price
        ? computeRealDiscount(hist, p.price, p.original_price, 90).verdict
        : 'none'
      return { product: p, buyScore: bs, realVerdict: rd }
    })
    return candidates
      .filter((c) => c.buyScore >= 70 && c.realVerdict === 'genuine')
      .sort((a, b) => b.buyScore - a.buyScore)
      .slice(0, 8)
      .map((c) => c.product)
  }, [productsData])

  // Case A: User is logged in and state is "ok"
  if (user && recData?.state === 'ok' && recData.items.length > 0) {
    return (
      <section
        aria-label="Recommended for you"
        style={{ paddingTop: '40px', paddingBottom: '40px' }}
      >
        <div className="container">
          <SectionHeader title="Recommended for you" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {recData.items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <ProductCard product={toCardData(item as any)} />
                {item.reason && (
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginTop: '6px',
                      lineHeight: 1.35,
                    }}
                  >
                    {item.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Case B: Logged in and state is "paused" OR "not_enough_activity", OR logged out
  const isPaused = user && recData?.state === 'paused'
  const isNeedsDeals = !user || recData?.state !== 'ok'
  const isLoading = (user && recLoading) || (isNeedsDeals && dealsLoading)

  if (isLoading) {
    return (
      <section style={{ paddingTop: '40px', paddingBottom: '40px' }}>
        <div className="container">
          <SectionHeader title={isNeedsDeals ? 'Good deals right now' : 'Recommended for you'} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-lg)',
                  overflow: 'hidden',
                  padding: '12px',
                }}
              >
                <Skeleton height={160} rounded="lg" style={{ marginBottom: 12 }} />
                <Skeleton width="40%" height={10} rounded="sm" style={{ marginBottom: 6 }} />
                <Skeleton width="80%" height={14} rounded="sm" style={{ marginBottom: 6 }} />
                <Skeleton width="50%" height={16} rounded="sm" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // If no good deals found either, omit
  if (goodDeals.length === 0) {
    if (isPaused) {
      return (
        <section style={{ paddingTop: '32px', paddingBottom: '32px' }}>
          <div className="container">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Personalization is paused.{' '}
              <Link
                to="/account"
                style={{ color: 'var(--ink-900)', textDecoration: 'underline', fontWeight: 600 }}
              >
                Turn on
              </Link>
            </p>
          </div>
        </section>
      )
    }
    return null
  }

  return (
    <section
      aria-label="Good deals right now"
      style={{ paddingTop: '40px', paddingBottom: '40px' }}
    >
      <div className="container">
        {isPaused && (
          <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Personalization is paused.{' '}
            <Link
              to="/account"
              style={{ color: 'var(--ink-900)', textDecoration: 'underline', fontWeight: 600 }}
            >
              Turn on
            </Link>
          </div>
        )}
        <SectionHeader title="Good deals right now" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {goodDeals.map((product) => (
            <ProductCard key={product.id} product={toCardData(product)} />
          ))}
        </div>
      </div>
    </section>
  )
}
