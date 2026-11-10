import { useQuery } from '@tanstack/react-query'
import SectionHeader from '../ui/SectionHeader'
import Skeleton from '../ui/Skeleton'
import ProductCard, { toCardData } from './ProductCard'
import { getSimilarProducts } from '../../api/products'
import { formatINR } from '../../lib/format'

interface Props {
  productId: string
  currentPrice: number
}

export default function SimilarProducts({ productId, currentPrice }: Props) {
  const { data: products, isLoading, isError } = useQuery({
    queryKey: ['similar-cheaper', productId],
    queryFn: ({ signal }) => getSimilarProducts(productId, 4, true, signal),
    enabled: Boolean(productId),
    staleTime: 5 * 60 * 1000,
  })

  if (isError) return null

  if (isLoading) {
    return (
      <section style={{ marginTop: '56px', width: '100%' }}>
        <SectionHeader title="Similar but cheaper" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                gap: '12px',
                paddingBottom: '12px',
              }}
            >
              <Skeleton height={180} style={{ borderRadius: 0 }} />
              <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton width="40%" height={12} rounded="sm" />
                <Skeleton width="85%" height={16} rounded="sm" />
                <Skeleton width="50%" height={18} rounded="sm" />
              </div>
              <div style={{ padding: '0 12px', marginTop: 'auto' }}>
                <Skeleton height={40} rounded="full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // If there are fewer than 2 results, hide the whole section (no empty box)
  if (!products || products.length < 2) {
    return null
  }

  return (
    <section style={{ marginTop: '56px', width: '100%' }}>
      <SectionHeader title="Similar but cheaper" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((p) => {
          const cardData = toCardData(p)
          const savings = currentPrice > p.price ? currentPrice - p.price : 0
          const savingsPct = currentPrice > 0 ? Math.round((savings / currentPrice) * 100) : 0
          if (savings > 0) {
            cardData.savingsBadge = `Save ${formatINR(savings)} (${savingsPct}% cheaper)`
          }
          return <ProductCard key={p.id} product={cardData} />
        })}
      </div>
    </section>
  )
}
