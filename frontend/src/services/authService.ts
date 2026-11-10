/**
 * Real authentication service delegating to backend auth endpoints.
 * All password hashing is done server-side using bcrypt.
 * No sensitive credentials or password hashes are ever stored in browser localStorage.
 */

import type { User } from '../api/auth'
import { useAuthStore } from '../store/auth'

export const authService = {
  async signUp(name: string, email: string, password: string): Promise<User> {
    return useAuthStore.getState().signup(name, email, password)
  },

  async signIn(email: string, password: string): Promise<User> {
    return useAuthStore.getState().login(email, password)
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    return useAuthStore.getState().changePassword(oldPassword, newPassword)
  },

  async signOut(): Promise<void> {
    return useAuthStore.getState().logout()
  },

  async getSession(): Promise<User | null> {
    return useAuthStore.getState().checkAuth()
  },
}
