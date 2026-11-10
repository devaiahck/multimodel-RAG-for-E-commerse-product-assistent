import type { ReactNode } from 'react'

export interface TableColumn {
  key: string
  header: string
  align?: 'left' | 'right'
  render?: (row: Record<string, unknown>) => ReactNode
}

export interface TableProps {
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  className?: string
}

export default function Table({ columns, rows, className }: TableProps) {
  if (!columns.length || !rows.length) return null

  return (
    <div
      className={className}
      style={{
        width: '100%',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        backgroundColor: 'var(--card)',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'Manrope, sans-serif',
          fontSize: '0.85rem',
          textAlign: 'left',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)', backgroundColor: 'var(--paper)' }}>
            {columns.map((col, idx) => {
              const isFirst = idx === 0
              return (
                <th
                  key={col.key || idx}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                    textAlign: col.align || 'left',
                    whiteSpace: 'nowrap',
                    position: isFirst ? 'sticky' : undefined,
                    left: isFirst ? 0 : undefined,
                    zIndex: isFirst ? 2 : 1,
                    backgroundColor: isFirst ? 'var(--paper)' : undefined,
                    borderRight: isFirst ? '1px solid var(--line)' : undefined,
                  }}
                >
                  {col.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const isLast = rowIdx === rows.length - 1
            return (
              <tr
                key={rowIdx}
                style={{
                  borderBottom: isLast ? 'none' : '1px solid var(--line)',
                  backgroundColor: 'var(--card)',
                }}
              >
                {columns.map((col, colIdx) => {
                  const isFirst = colIdx === 0
                  const rawVal = row[col.key]
                  let content: ReactNode = null
                  if (col.render) {
                    content = col.render(row)
                  } else if (rawVal !== undefined && rawVal !== null) {
                    content = typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal)
                  }

                  return (
                    <td
                      key={col.key || colIdx}
                      style={{
                        padding: '12px 16px',
                        color: 'var(--text)',
                        textAlign: col.align || 'left',
                        whiteSpace: 'nowrap',
                        position: isFirst ? 'sticky' : undefined,
                        left: isFirst ? 0 : undefined,
                        zIndex: isFirst ? 1 : 0,
                        backgroundColor: isFirst ? 'var(--card)' : undefined,
                        borderRight: isFirst ? '1px solid var(--line)' : undefined,
                      }}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

