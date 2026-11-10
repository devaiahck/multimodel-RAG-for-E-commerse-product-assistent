import { logUserActivity, type ActivityEvent } from '../api/auth'
import { useAuthStore } from '../store/auth'

/**
 * Log user activity event (view, search, budget run, cart add).
 * Fire-and-forget: never throws or blocks UI.
 * Does nothing when the user is logged out.
 */
export function trackActivity(event: ActivityEvent): void {
  try {
    const user = useAuthStore.getState().user
    if (!user) return

    logUserActivity({
      ...event,
      ts: event.ts || new Date().toISOString(),
    }).catch(() => {
      // Fire-and-forget; never disrupt UI
    })
  } catch {
    // Ignore any tracking errors
  }
}

