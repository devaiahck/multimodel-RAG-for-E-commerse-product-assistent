import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Product } from '../api/types'
import type { ProductCardData } from '../components/product/ProductCard'
import {
  fetchUserCart,
  setUserCartItem,
  deleteUserCartItem,
  fetchUserSaved,
  addUserSavedItem,
  deleteUserSavedItem,
  recordUserHistory,
} from '../api/auth'
import { useAuthStore } from './auth'
import { trackActivity } from '../services/activity'

export interface CartItem {
  productId: string
  title: string
  brand?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  store?: string
  storeUrl?: string
  qty: number
  addedAt: number
}

export interface SavedItem {
  productId: string
  title: string
  brand?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  category?: string
  rating?: number
  discountPercentage?: number
  store?: string
  storeUrl?: string
  savedAt: number
}

export type ProductInput = Product | ProductCardData

interface CartState {
  items: CartItem[]
  saved: SavedItem[]

  // Sync / account operations
  syncWithBackend: () => Promise<void>
  mergeGuestData: () => Promise<void>
  clearForLogout: () => void

  // Actions
  addToCart: (product: ProductInput) => void
  removeFromCart: (id: string) => void
  setQty: (id: string, qty: number) => void
  clearCart: () => void
  toggleSaved: (product: ProductInput) => void
  isSaved: (id: string) => boolean
  moveToCart: (id: string) => void
  moveToSaved: (id: string) => void
  recordPurchase: (productId: string, store?: string) => Promise<void>

  // Selectors / getters
  cartCount: () => number
  cartTotal: () => number
}

function normalizeProduct(p: ProductInput): {
  id: string
  title: string
  brand?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  category?: string
  rating?: number
  discountPercentage?: number
  store?: string
  storeUrl?: string
} {
  const id = 'id' in p ? p.id : ''
  const title = p.title || 'Untitled Product'
  const brand = p.brand
  const price = p.price || 0
  const originalPrice = 'original_price' in p ? p.original_price : 'originalPrice' in p ? p.originalPrice : undefined
  const imageUrl = 'image_url' in p ? p.image_url : 'imageUrl' in p ? p.imageUrl : undefined
  const category = p.category
  const rating = p.rating
  const discountPercentage = 'discount_percentage' in p ? p.discount_percentage : 'discountPercentage' in p ? p.discountPercentage : undefined
  const store = 'store' in p && typeof p.store === 'string' ? p.store : undefined
  const storeUrl = 'storeUrl' in p && typeof p.storeUrl === 'string' ? p.storeUrl : undefined

  return {
    id,
    title,
    brand,
    imageUrl,
    price,
    originalPrice,
    category,
    rating,
    discountPercentage,
    store,
    storeUrl,
  }
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      saved: [],

      syncWithBackend: async () => {
        try {
          const user = useAuthStore.getState().user
          if (!user) return

          const [cartData, savedData] = await Promise.all([
            fetchUserCart().catch(() => []),
            fetchUserSaved().catch(() => []),
          ])

          const mappedCart: CartItem[] = cartData.map((it) => ({
            productId: it.productId || it.product_id || '',
            title: it.title || it.productId || '',
            brand: it.brand,
            imageUrl: it.imageUrl,
            price: it.price || 0,
            originalPrice: it.originalPrice,
            store: it.store,
            qty: it.qty || it.quantity || 1,
            addedAt: Date.now(),
          }))

          const mappedSaved: SavedItem[] = savedData.map((it) => ({
            productId: it.productId || it.product_id || '',
            title: it.title || it.productId || '',
            brand: it.brand,
            imageUrl: it.imageUrl,
            price: it.price || 0,
            originalPrice: it.originalPrice,
            category: it.category,
            rating: it.rating,
            discountPercentage: it.discountPercentage,
            store: it.store,
            savedAt: it.savedAt ? new Date(it.savedAt).getTime() : Date.now(),
          }))

          set({ items: mappedCart, saved: mappedSaved })
        } catch {
          // Ignore sync errors gracefully
        }
      },

      mergeGuestData: async () => {
        try {
          const currentItems = get().items
          const currentSaved = get().saved

          // One-time merge of guest items into backend account
          const syncPromises: Promise<unknown>[] = []
          for (const item of currentItems) {
            syncPromises.push(setUserCartItem(item.productId, item.qty).catch(() => null))
          }
          for (const s of currentSaved) {
            syncPromises.push(addUserSavedItem(s.productId).catch(() => null))
          }

          await Promise.all(syncPromises)

          // Fetch fresh merged state
          await get().syncWithBackend()

          // Clear local guest copies so they don't duplicate
          try {
            localStorage.removeItem('urbanpick-cart')
          } catch {
            // ignore
          }
        } catch {
          // Fall back gracefully
        }
      },

      clearForLogout: () => {
        set({ items: [], saved: [] })
      },

      addToCart: (product) => {
        const norm = normalizeProduct(product)
        if (!norm.id) return

        let nextQty = 1
        set((state) => {
          const existingIndex = state.items.findIndex((item) => item.productId === norm.id)
          if (existingIndex > -1) {
            const nextItems = [...state.items]
            const current = nextItems[existingIndex]
            nextQty = Math.min(10, current.qty + 1)
            nextItems[existingIndex] = {
              ...current,
              qty: nextQty,
            }
            return { items: nextItems }
          }

          const newItem: CartItem = {
            productId: norm.id,
            title: norm.title,
            brand: norm.brand,
            imageUrl: norm.imageUrl,
            price: norm.price,
            originalPrice: norm.originalPrice,
            store: norm.store,
            storeUrl: norm.storeUrl,
            qty: 1,
            addedAt: Date.now(),
          }
          return { items: [...state.items, newItem] }
        })

        // If logged in, persist to backend and log activity
        const user = useAuthStore.getState().user
        if (user) {
          setUserCartItem(norm.id, nextQty).catch(() => null)
          trackActivity({
            type: 'cart_add',
            product_id: norm.id,
            category: norm.category,
            brand: norm.brand,
            price: norm.price,
          })
        }
      },

      removeFromCart: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.productId !== id),
        }))

        const user = useAuthStore.getState().user
        if (user) {
          deleteUserCartItem(id).catch(() => null)
        }
      },

      setQty: (id, qty) => {
        const clamped = Math.max(1, Math.min(10, Math.floor(qty)))
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === id ? { ...item, qty: clamped } : item
          ),
        }))

        const user = useAuthStore.getState().user
        if (user) {
          setUserCartItem(id, clamped).catch(() => null)
        }
      },

      clearCart: () => {
        const currentItems = get().items
        set({ items: [] })

        const user = useAuthStore.getState().user
        if (user) {
          for (const it of currentItems) {
            deleteUserCartItem(it.productId).catch(() => null)
          }
        }
      },

      toggleSaved: (product) => {
        const norm = normalizeProduct(product)
        if (!norm.id) return

        let isNowSaved = false
        set((state) => {
          const exists = state.saved.some((item) => item.productId === norm.id)
          if (exists) {
            isNowSaved = false
            return { saved: state.saved.filter((item) => item.productId !== norm.id) }
          }

          isNowSaved = true
          const newSaved: SavedItem = {
            productId: norm.id,
            title: norm.title,
            brand: norm.brand,
            imageUrl: norm.imageUrl,
            price: norm.price,
            originalPrice: norm.originalPrice,
            category: norm.category,
            rating: norm.rating,
            discountPercentage: norm.discountPercentage,
            store: norm.store,
            storeUrl: norm.storeUrl,
            savedAt: Date.now(),
          }
          return { saved: [...state.saved, newSaved] }
        })

        const user = useAuthStore.getState().user
        if (user) {
          if (isNowSaved) {
            addUserSavedItem(norm.id).catch(() => null)
            trackActivity({
              type: 'saved_add',
              product_id: norm.id,
              category: norm.category,
              brand: norm.brand,
              price: norm.price,
            })
          } else {
            deleteUserSavedItem(norm.id).catch(() => null)
          }
        }
      },

      isSaved: (id) => {
        return get().saved.some((item) => item.productId === id)
      },

      moveToCart: (id) => {
        const state = get()
        const target = state.saved.find((item) => item.productId === id)
        if (!target) return

        set((s) => ({
          saved: s.saved.filter((item) => item.productId !== id),
        }))
        state.addToCart({
          id: target.productId,
          title: target.title,
          brand: target.brand,
          imageUrl: target.imageUrl,
          price: target.price,
          originalPrice: target.originalPrice,
          category: target.category,
          storeUrl: target.storeUrl,
        })

        const user = useAuthStore.getState().user
        if (user) {
          deleteUserSavedItem(id).catch(() => null)
        }
      },

      moveToSaved: (id) => {
        const state = get()
        const target = state.items.find((item) => item.productId === id)
        if (!target) return

        set((s) => ({
          items: s.items.filter((item) => item.productId !== id),
        }))
        state.toggleSaved({
          id: target.productId,
          title: target.title,
          brand: target.brand,
          imageUrl: target.imageUrl,
          price: target.price,
          originalPrice: target.originalPrice,
          storeUrl: target.storeUrl,
        })

        const user = useAuthStore.getState().user
        if (user) {
          deleteUserCartItem(id).catch(() => null)
        }
      },

      recordPurchase: async (productId: string, store?: string) => {
        const user = useAuthStore.getState().user
        if (!user) return
        try {
          await recordUserHistory(productId, store)
        } catch {
          // ignore
        }
      },

      cartCount: () => {
        return get().items.reduce((sum, item) => sum + item.qty, 0)
      },

      cartTotal: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.qty, 0)
      },
    }),
    {
      name: 'urbanpick-cart',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return localStorage.getItem(name)
          } catch {
            return null
          }
        },
        setItem: (name: string, value: string) => {
          try {
            localStorage.setItem(name, value)
          } catch {
            // ignore
          }
        },
        removeItem: (name: string) => {
          try {
            localStorage.removeItem(name)
          } catch {
            // ignore
          }
        },
      })),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          try {
            localStorage.removeItem('urbanpick-cart')
          } catch {
            // ignore
          }
        }
      },
    }
  )
)
