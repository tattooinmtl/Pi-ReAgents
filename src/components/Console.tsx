import { useRef, useEffect } from 'react'
import { DraggableWindow } from './DraggableWindow'

interface ConsoleProps {
  logs: string[]
  onClear: () => void
  onClose: () => void
}

export function Console({ logs, onClear, onClose }: ConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <DraggableWindow title="Console" initialWidth={480} initialHeight={260} onClose={onClose} dockZone="bottom-right">
      <div className="console-header-bar">
        <span className="console-count">{logs.length} lines</span>
        <button className="btn btn-sm btn-secondary" onClick={onClear}>Clear</button>
      </div>
      <div className="console-body">
        {logs.map((line, i) => (
          <div key={i} className="console-line">{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </DraggableWindow>
  )
}
