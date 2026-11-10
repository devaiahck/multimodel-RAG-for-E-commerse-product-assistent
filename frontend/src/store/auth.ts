import { create } from 'zustand'
import {
  authLogin,
  authSignUp,
  authMe,
  authLogout,
  authChangePassword,
  authDeleteAccount,
  type User,
} from '../api/auth'
import { useCartStore } from './cart'

export type { User }

interface AuthState {
  user: User | null
  isLoading: boolean
  isInitialized: boolean

  checkAuth: () => Promise<User | null>
  login: (email: string, password: string) => Promise<User>
  signup: (name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  deleteAccount: (password: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  checkAuth: async () => {
    try {
      set({ isLoading: true })
      const res = await authMe()
      set({ user: res.user, isLoading: false, isInitialized: true })
      // Sync cart and saved items with backend
      useCartStore.getState().syncWithBackend()
      return res.user
    } catch {
      set({ user: null, isLoading: false, isInitialized: true })
      return null
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await authLogin(email, password)
      set({ user: res.user, isLoading: false, isInitialized: true })
      // Merge guest cart and saved items into user account
      await useCartStore.getState().mergeGuestData()
      return res.user
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  signup: async (name: string, email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await authSignUp(name, email, password)
      set({ user: res.user, isLoading: false, isInitialized: true })
      // Merge guest cart and saved items into user account
      await useCartStore.getState().mergeGuestData()
      return res.user
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    try {
      await authLogout()
    } catch {
      // ignore
    } finally {
      set({ user: null })
      useCartStore.getState().clearForLogout()
    }
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    await authChangePassword(oldPassword, newPassword)
  },

  deleteAccount: async (password: string) => {
    try {
      await authDeleteAccount(password)
    } finally {
      set({ user: null })
      useCartStore.getState().clearForLogout()
    }
  },
}))
