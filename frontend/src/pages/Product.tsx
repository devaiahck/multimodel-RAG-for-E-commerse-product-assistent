import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useProduct } from '../hooks/useProduct'
import ProductImage from '../components/product/ProductImage'
import ProductDetails from '../components/product/ProductDetails'
import WhereToBuy from '../components/product/WhereToBuy'
import PriceAnalysisSection from '../components/product/PriceAnalysisSection'
import SaleWatchSection from '../components/product/SaleWatchSection'
import PriceAlertSection from '../components/product/PriceAlertSection'
import SimilarProducts from '../components/product/SimilarProducts'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import { isApiError } from '../api/client'
import { trackActivity } from '../services/activity'

export default function Product() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, error, refetch } = useProduct(id)

  useEffect(() => {
    if (product?.id) {
      trackActivity({
        type: 'view',
        product_id: product.id,
        category: product.category,
        brand: product.brand,
        price: product.price,
      })
    }
  }, [product?.id])

  useEffect(() => {
    if (product?.title) {
      document.title = `${product.title} – UrbanPick`
    } else {
      document.title = 'Product – UrbanPick'
    }
  }, [product?.title])

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '40px 0 80px', maxWidth: 1100 }}>
        <Skeleton style={{ width: 220, height: 20, marginBottom: 32 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
          }}
        >
          <Skeleton style={{ width: '100%', aspectRatio: '1/1', borderRadius: 'var(--r-xl)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Skeleton style={{ width: '40%', height: 16 }} />
            <Skeleton style={{ width: '90%', height: 36 }} />
            <Skeleton style={{ width: '30%', height: 40 }} />
            <Skeleton style={{ width: '100%', height: 48, borderRadius: 'var(--r-pill)' }} />
            <Skeleton style={{ width: '100%', height: 120, borderRadius: 'var(--r-md)' }} />
          </div>
        </div>
      </div>
    )
  }

  const isNotFound = isApiError(error) && error.status === 404

  if (isNotFound || (!product && !error)) {
    return (
      <div className="container" style={{ padding: '60px 0 100px' }}>
        <EmptyState
          title="We couldn't find that product"
          message="The product you are looking for may have been removed or does not exist."
        >
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 24px',
              backgroundColor: 'var(--ink-900)',
              color: 'var(--on-dark)',
              borderRadius: 'var(--r-pill)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Go to home
          </Link>
        </EmptyState>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container" style={{ padding: '60px 0 100px' }}>
        <ErrorState message={error.message || 'Failed to load product details'} onRetry={() => refetch()} />
      </div>
    )
  }

  if (!product) return null

  // Breadcrumbs parsing: top-level category
  const rawCat = product.category || ''
  const topCat = rawCat.includes(' / ') ? rawCat.split(' / ')[0].trim() : rawCat.trim()
  const topCatSlug = topCat.toLowerCase()

  return (
    <div style={{ padding: '32px 0 80px', minHeight: '80vh' }}>
      <div className="container" style={{ maxWidth: 1100 }}>
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumbs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            marginBottom: '32px',
            flexWrap: 'wrap',
          }}
        >
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Home
          </Link>
          {topCat && (
            <>
              <ChevronRight size={13} strokeWidth={1.5} />
              <Link to={`/category/${topCatSlug}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                {topCat}
              </Link>
            </>
          )}
          <ChevronRight size={13} strokeWidth={1.5} />
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{product.title}</span>
        </nav>

        {/* Two-column layout: image left, details right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '48px',
            alignItems: 'start',
          }}
        >
          <ProductImage
            imageUrl={product.image_url}
            title={product.title}
            category={product.category}
            credit={product.image_credit}
          />
          <ProductDetails product={product} />
        </div>

        {/* Where to buy store comparison card */}
        <WhereToBuy stores={Array.isArray(product.store_availability) ? product.store_availability : []} />

        {/* Buyhatke-style Price Analysis Section (Chart, 2x2 Stats Grid, Semicircle Gauge) */}
        <PriceAnalysisSection
          history={Array.isArray(product.price_history) ? product.price_history : []}
          currentPrice={product.price}
          stores={Array.isArray(product.store_availability) ? product.store_availability : []}
        />

        {/* Sale Watch Section */}
        <SaleWatchSection
          history={Array.isArray(product.price_history) ? product.price_history : []}
          currentPrice={product.price}
        />

        {/* Price Drop Alert Section */}
        <PriceAlertSection
          productId={product.id}
          productTitle={product.title}
          currentPrice={product.price}
          lowestPrice={
            Array.isArray(product.price_history) && product.price_history.length > 0
              ? Math.min(...product.price_history.map((p) => p.price))
              : product.price
          }
        />

        {/* Similar but cheaper products recommendation grid */}
        <SimilarProducts productId={product.id} currentPrice={product.price} />
      </div>
    </div>
  )
}

