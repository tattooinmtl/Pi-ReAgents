import { useState, useRef, useEffect } from 'react'
import { DraggableWindow } from './DraggableWindow'

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

  const body = (
    <>
      <div className="console-body" style={{ flex: 1, minHeight: 0 }}>
        {lines.map((line, i) => <pre key={i} className="console-line">{line}</pre>)}
        <div ref={bottomRef} />
      </div>
      <form className="terminal-input-row" onSubmit={handleSubmit}>
        <span className="terminal-prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={api ? 'Type a command...' : 'Terminal requires Electron'}
          autoFocus
        />
      </form>
    </>
  )

  return (
    <DraggableWindow title="Terminal" initialWidth={640} initialHeight={320} onClose={onClose} dockZone="bottom-left">
      {body}
    </DraggableWindow>
  )
}
