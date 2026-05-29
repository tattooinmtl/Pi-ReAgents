import { useState, useRef, useEffect } from 'react'
import type { Message, Skill, GenerationStats, ContextFile } from '../types'

interface ChatProps {
  messages: Message[]
  isProcessing: boolean
  enabledSkills: Skill[]
  onSend: (message: string) => void
  onCommand: (cmd: string, args: string) => void
  onRunAgents?: (message: string) => void
  onStop: () => void
  onApplyCode?: (code: string, lang: string) => void
  onOpenInCodingSpace?: (code: string, lang: string) => void
  onSendToChapter?: (text: string) => void
  openBookFileName?: string | null
  generationStats?: GenerationStats | null
  contextLength?: number
  contextFiles?: ContextFile[]
  onAttachFile?: () => void
  onRemoveFile?: (path: string) => void
}

function ContextRing({ used, total }: { used: number; total: number }) {
  const ratio = Math.min(used / total, 1)
  const r = 10
  const circ = 2 * Math.PI * r
  const dash = circ * ratio
  const color = ratio >= 0.9 ? '#ef4444' : ratio >= 0.75 ? '#f97316' : ratio >= 0.5 ? '#eab308' : '#22c55e'
  const pct = Math.round(ratio * 100)

  return (
    <div className="context-ring" title={`Context: ${used.toLocaleString()} / ${total.toLocaleString()} tokens (${pct}%)`}>
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="13" cy="13" r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 13 13)"
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke 0.4s ease' }}
        />
      </svg>
      <span className="context-ring-label" style={{ color }}>{pct}%</span>
    </div>
  )
}

const COMMANDS = [
  { cmd: 'help',      desc: 'Show all available commands' },
  { cmd: 'providers', desc: 'Manage AI providers (local, OpenAI, Ollama, custom)' },
  { cmd: 'btw',       desc: 'Add a private context note', hint: '<note>' },
  { cmd: 'compact',   desc: 'Summarise & reset context — use when ring hits ~90%' },
  { cmd: 'clear',     desc: 'Clear current chat (no summary)' },
  { cmd: 'new',       desc: 'Start a new session' },
  { cmd: 'models',    desc: 'Open model manager' },
  { cmd: 'skills',    desc: 'Open skills manager' },
  { cmd: 'code',      desc: 'Toggle code assistant mode' },
  { cmd: 'system',    desc: 'Change system prompt', hint: '<new prompt>' },
  { cmd: 'temp',      desc: 'Set temperature', hint: '<0.1–2.0>' },
  { cmd: 'tokens',    desc: 'Set max tokens', hint: '<number>' },
  { cmd: 'save',      desc: 'Save current session to memory' },
  { cmd: 'export',    desc: 'Export chat as text file' },
  { cmd: 'agents',    desc: 'Open agents panel / run multi-agent mode' },
  { cmd: 'book',      desc: 'Open book studio — create & manage your book project', hint: '[load|build]' },
  { cmd: 'build',     desc: 'Build the full book from chapters', hint: 'book' },
]

function ChatMessage({
  msg,
  onApplyCode,
  onOpenInCodingSpace,
  onSendToChapter,
  openBookFileName,
}: {
  msg: Message
  onApplyCode?: (c: string, l: string) => void
  onOpenInCodingSpace?: (c: string, l: string) => void
  onSendToChapter?: (text: string) => void
  openBookFileName?: string | null
}) {
  // BTW notes use a distinct style — they carry a [BTW] prefix injected by App
  const isBtw = msg.role === 'system' && msg.content.startsWith('[BTW]')

  const blocks: JSX.Element[] = []
  const parts = msg.content.split(/(```\w*\n[\s\S]*?\n```)/g)
  let idx = 0

  for (const part of parts) {
    const match = part.match(/^```(\w*)\n([\s\S]*?)\n```$/)
    if (match) {
      const lang = match[1] || 'text'
      const code = match[2]
      blocks.push(
        <pre key={idx++} className="code-block">
          <div className="code-block-header">
            <span>{lang}</span>
            <div className="code-block-actions">
              {onOpenInCodingSpace && (
                <button
                  className="btn btn-codespace"
                  onClick={() => onOpenInCodingSpace(code, lang)}
                  title="Open in coding space"
                >
                  Code Space
                </button>
              )}
              {onApplyCode && (
                <button
                  className="btn btn-apply"
                  onClick={() => onApplyCode(code, lang)}
                  title="Write to open file"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
          <code>{code}</code>
        </pre>
      )
    } else {
      blocks.push(<span key={idx++} className="message-text">{part}</span>)
    }
  }

  if (isBtw) {
    return (
      <div className="message message-btw">
        <span className="btw-icon">📌</span>
        <span className="btw-text">{msg.content.replace('[BTW] ', '')}</span>
      </div>
    )
  }

  return (
    <div className={`message message-${msg.role}`}>
      <div className="message-header">
        <span className="message-role">
          {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'System'}
        </span>
        {msg.model && <span className="message-model">{msg.model}</span>}
        {msg.role === 'assistant' && onSendToChapter && openBookFileName && (
          <button
            className="btn btn-send-chapter"
            onClick={() => onSendToChapter(msg.content)}
            title={`Append this response to ${openBookFileName}`}
          >
            📖 Send to {openBookFileName}
          </button>
        )}
      </div>
      <div className="message-content">{blocks}</div>
    </div>
  )
}

export function Chat({
  messages,
  isProcessing,
  enabledSkills,
  onSend,
  onCommand,
  onRunAgents,
  onStop,
  onApplyCode,
  onOpenInCodingSpace,
  onSendToChapter,
  openBookFileName,
  generationStats,
  contextLength = 4096,
  contextFiles = [],
  onAttachFile,
  onRemoveFile,
}: ChatProps) {
  const [input, setInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Estimate context usage: prefer server-reported promptTokens, fall back to char/4 heuristic
  const estimatedTokens = generationStats?.promptTokens && generationStats.promptTokens > 0
    ? generationStats.promptTokens + generationStats.tokenCount
    : Math.round(messages.reduce((acc, m) => acc + m.content.length, 0) / 4)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isProcessing) inputRef.current?.focus()
  }, [isProcessing])

  // Derive filtered command list from input
  const slashFilter = input.startsWith('/') ? input.slice(1).split(' ')[0].toLowerCase() : ''
  const filteredCmds = input.startsWith('/')
    ? COMMANDS.filter((c) => c.cmd.startsWith(slashFilter))
    : []

  // Sync menu visibility with filter
  useEffect(() => {
    const open = filteredCmds.length > 0 && !input.includes(' ')
    setMenuOpen(open)
    setMenuIndex(0)
  }, [input]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectCommand = (cmd: string) => {
    const hint = COMMANDS.find((c) => c.cmd === cmd)?.hint
    setInput(hint ? `/${cmd} ` : `/${cmd}`)
    setMenuOpen(false)
    inputRef.current?.focus()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    if (trimmed.startsWith('/')) {
      const [cmdPart, ...rest] = trimmed.slice(1).split(' ')
      const cmd = cmdPart.toLowerCase()
      const args = rest.join(' ')
      onCommand(cmd, args)
      setInput('')
      setMenuOpen(false)
      return
    }

    if (isProcessing) return

    onSend(trimmed)
    setInput('')
    setMenuOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuIndex((i) => (i + 1) % filteredCmds.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuIndex((i) => (i - 1 + filteredCmds.length) % filteredCmds.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        e.preventDefault()
        selectCommand(filteredCmds[menuIndex].cmd)
        return
      }
      if (e.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        selectCommand(filteredCmds[menuIndex].cmd)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <img src="./img/LogoApp.png" alt="Pi-ReAgents AI" className="welcome-logo" />
            <h2>Pi-ReAgents AI</h2>
            <p>Type a message or <kbd>/</kbd> for commands</p>
            {enabledSkills.length > 0 && (
              <div className="active-skills">
                <small>Active skills: {enabledSkills.map((s) => s.name).join(', ')}</small>
              </div>
            )}
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            msg={msg}
            onApplyCode={onApplyCode}
            onOpenInCodingSpace={onOpenInCodingSpace}
            onSendToChapter={onSendToChapter}
            openBookFileName={openBookFileName}
          />
        ))}
        {isProcessing && (
          <div className="message message-assistant">
            <div className="message-header">
              <span className="message-role">AI</span>
            </div>
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-wrap">
        {generationStats && (
          <div className="gen-stats-bar">
            <span className="gen-stat">{generationStats.tokensPerSec.toFixed(1)} t/s</span>
            <span className="gen-stat-sep">·</span>
            <span className="gen-stat">{generationStats.tokenCount} tokens</span>
            {generationStats.promptTokens > 0 && (
              <>
                <span className="gen-stat-sep">·</span>
                <span className="gen-stat">{generationStats.promptTokens} prompt</span>
              </>
            )}
            <span className="gen-stat-sep">·</span>
            <span className="gen-stat">{generationStats.elapsedSec.toFixed(1)}s</span>
          </div>
        )}
        {contextFiles.length > 0 && (
          <div className="context-files-bar">
            {contextFiles.map(f => (
              <div key={f.path} className="context-file-chip" title={f.path}>
                <span className="context-file-icon">📄</span>
                <span className="context-file-name">{f.name}</span>
                <span className="context-file-size">{Math.round(f.content.length / 102.4) / 10}KB</span>
                {onRemoveFile && (
                  <button
                    className="context-file-remove"
                    onClick={() => onRemoveFile(f.path)}
                    title={`Remove ${f.name} from context`}
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
        {menuOpen && filteredCmds.length > 0 && (
          <div className="cmd-menu">
            {filteredCmds.map((c, i) => (
              <div
                key={c.cmd}
                className={`cmd-menu-item ${i === menuIndex ? 'selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c.cmd) }}
                onMouseEnter={() => setMenuIndex(i)}
              >
                <span className="cmd-name">/{c.cmd}</span>
                {c.hint && <span className="cmd-hint">{c.hint}</span>}
                <span className="cmd-desc">{c.desc}</span>
              </div>
            ))}
          </div>
        )}
        <form className="chat-input-bar" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isProcessing ? '/command only while AI is responding…' : 'Message… or /command'}
            rows={1}
          />
          <ContextRing used={estimatedTokens} total={contextLength} />
          {estimatedTokens / contextLength >= 0.85 && !isProcessing && (
            <button
              type="button"
              className="btn btn-compact-warn"
              onClick={() => onCommand('compact', '')}
              title="Context nearly full — click to compact"
            >
              /compact
            </button>
          )}
          {onAttachFile && (
            <button
              type="button"
              className="btn btn-attach"
              onClick={onAttachFile}
              title="Attach file to context (injected as system context, not chat)"
            >📎</button>
          )}
          {isProcessing ? (
            <button type="button" className="btn btn-stop" onClick={onStop}>
              Stop
            </button>
          ) : (
            <>
              {onRunAgents && input.trim() && !input.trim().startsWith('/') && (
                <button
                  type="button"
                  className="btn btn-agents"
                  title="Dispatch to multi-agent system"
                  onClick={() => {
                    const msg = input.trim()
                    if (msg) { onRunAgents(msg); setInput(''); setMenuOpen(false) }
                  }}
                >
                  Agents
                </button>
              )}
              <button type="submit" className="btn btn-send" disabled={!input.trim()}>
                Send
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
