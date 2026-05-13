import { useState, useRef, useEffect } from 'react'
import type { Message, Skill } from '../types'

interface ChatProps {
  messages: Message[]
  isProcessing: boolean
  enabledSkills: Skill[]
  onSend: (message: string) => void
  onStop: () => void
  onApplyCode?: (code: string, lang: string) => void
  onOpenInCodingSpace?: (code: string, lang: string) => void
}

function ChatMessage({ msg, onApplyCode, onOpenInCodingSpace }: { msg: Message; onApplyCode?: (c: string, l: string) => void; onOpenInCodingSpace?: (c: string, l: string) => void }) {
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
              <button className="btn btn-codespace" onClick={() => onOpenInCodingSpace(code, lang)} title="Open in coding space">
                Code Space
              </button>
            )}
            {onApplyCode && (
              <button className="btn btn-apply" onClick={() => onApplyCode(code, lang)} title="Write to open file">
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

  return (
    <div className={`message message-${msg.role}`}>
      <div className="message-header">
        <span className="message-role">
          {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'AI' : 'System'}
        </span>
        {msg.model && <span className="message-model">{msg.model}</span>}
      </div>
      <div className="message-content">{blocks}</div>
    </div>
  )
}

export function Chat({ messages, isProcessing, enabledSkills, onSend, onStop, onApplyCode, onOpenInCodingSpace }: ChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isProcessing) inputRef.current?.focus()
  }, [isProcessing])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isProcessing) return
    onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
            <img src="/img/LogoApp.png" alt="Pi-ReAgents AI" className="welcome-logo" />
            <h2>Pi-ReAgents AI</h2>
            <p>Send a message to start chatting</p>
            {enabledSkills.length > 0 && (
              <div className="active-skills">
                <small>Active skills: {enabledSkills.map(s => s.name).join(', ')}</small>
              </div>
            )}
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} onApplyCode={onApplyCode} onOpenInCodingSpace={onOpenInCodingSpace} />
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

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for new line)"
          rows={1}
          disabled={isProcessing}
        />
        {isProcessing ? (
          <button type="button" className="btn btn-stop" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-send" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  )
}
