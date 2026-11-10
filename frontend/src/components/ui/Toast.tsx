import { create } from 'zustand'

interface ToastState {
  message: string | null
  visible: boolean
  showToast: (message: string, durationMs?: number) => void
  hideToast: () => void
}

let timeoutId: ReturnType<typeof setTimeout> | null = null

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  visible: false,
  showToast: (message: string, durationMs = 2000) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    set({ message, visible: true })
    timeoutId = setTimeout(() => {
      set({ visible: false })
      timeoutId = null
    }, durationMs)
  },
  hideToast: () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    set({ visible: false })
  },
}))

export default function Toast() {
  const message = useToastStore((s) => s.message)
  const visible = useToastStore((s) => s.visible)

  if (!visible || !message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: 'var(--ink-900)',
        color: 'var(--on-dark)',
        border: '1px solid var(--border-dark)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        borderRadius: 'var(--r-pill)',
        padding: '10px 20px',
        fontSize: '0.85rem',
        fontWeight: 500,
        fontFamily: 'Manrope, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        animation: 'cardEntrance var(--dur-fast) var(--ease-out)',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: 'var(--champagne)',
          display: 'inline-block',
        }}
        aria-hidden="true"
      />
      {message}
    </div>
  )
}

