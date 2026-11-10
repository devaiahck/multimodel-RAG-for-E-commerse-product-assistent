import { useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Tabs, { type TabItem } from '../components/ui/Tabs'
import EmptyState from '../components/ui/EmptyState'
import CartRow from '../components/cart/CartRow'
import SavedRow from '../components/cart/SavedRow'
import CartSummary from '../components/cart/CartSummary'
import { useCartStore } from '../store/cart'
import { useAuthStore } from '../store/auth'
import { fetchUserSavedInsights } from '../api/auth'

export default function Cart() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'saved' ? 'saved' : 'cart'
  const user = useAuthStore((s) => s.user)

  const items = useCartStore((s) => s.items)
  const saved = useCartStore((s) => s.saved)
  const cartTotal = useCartStore((s) => s.cartTotal())
  const itemCount = useCartStore((s) => s.cartCount())

  const setQty = useCartStore((s) => s.setQty)
  const removeFromCart = useCartStore((s) => s.removeFromCart)
  const clearCart = useCartStore((s) => s.clearCart)
  const toggleSaved = useCartStore((s) => s.toggleSaved)
  const moveToCart = useCartStore((s) => s.moveToCart)
  const moveToSaved = useCartStore((s) => s.moveToSaved)

  // Fetch saved insights when viewing saved tab and logged in
  const { data: insightsData } = useQuery({
    queryKey: ['me', 'saved-insights', user?.id],
    queryFn: fetchUserSavedInsights,
    enabled: Boolean(user) && activeTab === 'saved',
    staleTime: 0,
  })

  const insightsMap = useMemo(() => {
    const map = new Map<string, 'good_time' | 'wait' | 'fair'>()
    if (insightsData) {
      for (const it of insightsData) {
        map.set(it.product_id, it.verdict)
      }
    }
    return map
  }, [insightsData])

  useEffect(() => {
    document.title = 'Your cart – UrbanPick'
  }, [])

  function handleTabChange(tabId: string) {
    const next = new URLSearchParams(searchParams)
    if (tabId === 'saved') {
      next.set('tab', 'saved')
    } else {
      next.delete('tab')
    }
    setSearchParams(next)
  }

  const tabs: TabItem[] = [
    { id: 'cart', label: `Cart (${itemCount})` },
    { id: 'saved', label: `Saved (${saved.length})` },
  ]

  return (
    <div style={{ minHeight: '80vh', padding: '40px 0 80px' }}>
      <div className="container" style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.8rem)',
              margin: '0 0 16px',
              color: 'var(--text)',
            }}
          >
            Your cart
          </h1>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
        </div>

        {/* Tab Panels */}
        {activeTab === 'cart' ? (
          items.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              message="Explore our collection and discover the best deals across every store."
              suggestions={['Browse trending picks', 'Search for products, brands or deals']}
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
                Browse products
              </Link>
            </EmptyState>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 32,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {items.map((item) => (
                  <CartRow
                    key={item.productId}
                    item={item}
                    onSetQty={setQty}
                    onRemove={removeFromCart}
                    onMoveToSaved={moveToSaved}
                  />
                ))}
              </div>
              <div style={{ maxWidth: 380, width: '100%', justifySelf: 'end' }}>
                <CartSummary
                  total={cartTotal}
                  itemCount={itemCount}
                  onClearCart={clearCart}
                />
              </div>
            </div>
          )
        ) : saved.length === 0 ? (
          <EmptyState
            title="No saved items yet"
            message="Tap the heart on any product card to shortlist it here for comparison."
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
              Browse products
            </Link>
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
            {saved.map((item) => (
              <SavedRow
                key={item.productId}
                item={item}
                verdict={insightsMap.get(item.productId)}
                onMoveToCart={moveToCart}
                onRemove={(id) => toggleSaved({ id, title: item.title, price: item.price })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

