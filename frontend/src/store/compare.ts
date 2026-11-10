import { create } from 'zustand'
import { useToastStore } from '../components/ui/Toast'

export interface CompareItem {
  id: string
  title: string
  price: number
  imageUrl?: string
  brand?: string
  category?: string
}

interface CompareState {
  items: CompareItem[]
  addItem: (item: CompareItem) => boolean
  removeItem: (id: string) => void
  toggleItem: (item: CompareItem) => boolean
  isInCompare: (id: string) => boolean
  clearCompare: () => void
  setItems: (items: CompareItem[]) => void
}

const STORAGE_KEY = 'urbanpick-compare-items'

function loadFromStorage(): CompareItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 3) : []
  } catch {
    return []
  }
}

function saveToStorage(items: CompareItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage errors (private mode / quota exceeded)
  }
}

export const useCompareStore = create<CompareState>((set, get) => ({
  items: loadFromStorage(),

  addItem: (item) => {
    const { items } = get()
    if (items.some((i) => i.id === item.id)) {
      return true
    }
    if (items.length >= 3) {
      useToastStore.getState().showToast('You can compare up to 3 products at a time.')
      return false
    }
    const next = [...items, item]
    saveToStorage(next)
    set({ items: next })
    return true
  },

  removeItem: (id) => {
    const next = get().items.filter((i) => i.id !== id)
    saveToStorage(next)
    set({ items: next })
  },

  toggleItem: (item) => {
    const { items, removeItem, addItem } = get()
    if (items.some((i) => i.id === item.id)) {
      removeItem(item.id)
      return true
    }
    return addItem(item)
  },

  isInCompare: (id) => {
    return get().items.some((i) => i.id === id)
  },

  clearCompare: () => {
    saveToStorage([])
    set({ items: [] })
  },

  setItems: (items) => {
    const sliced = items.slice(0, 3)
    saveToStorage(sliced)
    set({ items: sliced })
  },
}))

