import { useState, useRef, useEffect } from 'react'

interface TerminalProps {
  onClose: () => void
}

export function Terminal({ onClose }: TerminalProps) {
  const [lines, setLines] = useState<string[]>(['Terminal ready. Type a command and press Enter.\n'])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const api = window.electronAPI

  useEffect(() => {
    if (!api) return
    api.startTerminal().catch(() => {})
    const unsub = api.onTerminalOutput((data) => {
      setLines((prev) => [...prev, data])
    })
    return () => {
      unsub?.()
      api.stopTerminal().catch(() => {})
    }
  }, [api])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setLines((prev) => [...prev, `> ${trimmed}\n`])
    api?.sendTerminalInput(trimmed).catch(() => {})
    setInput('')
  }

  if (!api) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="terminal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="terminal-header">
            <span>Terminal</span>
            <button className="btn btn-close" onClick={onClose}>×</button>
          </div>
          <div className="terminal-body">
            <p style={{ padding: 20, color: 'var(--text-muted)' }}>Terminal requires Electron. Run with <code>npm run electron:dev</code>.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="terminal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="terminal-header">
          <span>Terminal</span>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>
        <div className="terminal-body">
          {lines.map((line, i) => <pre key={i} className="terminal-line">{line}</pre>)}
          <div ref={bottomRef} />
        </div>
        <form className="terminal-input-row" onSubmit={handleSubmit}>
          <span className="terminal-prompt">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            autoFocus
          />
        </form>
      </div>
    </div>
  )
}
