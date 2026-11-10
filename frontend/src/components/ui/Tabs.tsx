import type { KeyboardEvent } from 'react'

export interface TabItem {
  id: string
  label: string
}

interface Props {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
}

export default function Tabs({ tabs, activeTab, onChange }: Props) {
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (index + 1) % tabs.length
      onChange(tabs[nextIndex].id)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (index - 1 + tabs.length) % tabs.length
      onChange(tabs[prevIndex].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(tabs[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(tabs[tabs.length - 1].id)
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Cart views"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: 'var(--tile)',
        padding: '4px',
        borderRadius: 'var(--r-pill)',
        border: '1px solid var(--line)',
      }}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--r-pill)',
              border: 'none',
              backgroundColor: isActive ? 'var(--card)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 500,
              fontSize: '0.85rem',
              fontFamily: 'Manrope, sans-serif',
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              transition: `all var(--dur-fast) var(--ease-out)`,
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

