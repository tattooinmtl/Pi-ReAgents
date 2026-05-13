import { useState, useRef, useEffect } from 'react'

interface ConsoleProps {
  logs: string[]
  onClear: () => void
}

export function Console({ logs, onClear }: ConsoleProps) {
  const [collapsed, setCollapsed] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, collapsed])

  return (
    <div className={`console ${collapsed ? 'console-collapsed' : 'console-expanded'}`}>
      <div className="console-header">
        <button className="console-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▲ Console' : '▼ Console'}
        </button>
        <span className="console-count">{logs.length} lines</span>
        <button className="btn btn-sm btn-secondary" onClick={onClear}>Clear</button>
      </div>
      {!collapsed && (
        <div className="console-body">
          {logs.map((line, i) => (
            <div key={i} className="console-line">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
