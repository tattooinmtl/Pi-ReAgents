import { useState } from 'react'
import type { MemorySession } from '../types'

interface MemoryViewerProps {
  sessions: MemorySession[]
  onLoadSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onNewSession: () => void
  onClose: () => void
}

export function MemoryViewer({ sessions, onLoadSession, onDeleteSession, onNewSession, onClose }: MemoryViewerProps) {
  const [search, setSearch] = useState('')

  const filtered = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase())
  )

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const groupByDate = (sessions: MemorySession[]): Record<string, MemorySession[]> => {
    const groups: Record<string, MemorySession[]> = {}
    for (const s of sessions) {
      const date = new Date(s.updated).toLocaleDateString()
      if (!groups[date]) groups[date] = []
      groups[date].push(s)
    }
    return groups
  }

  const grouped = groupByDate(filtered)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content memory-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Memory Sessions</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        <div className="memory-toolbar">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button className="btn btn-primary" onClick={onNewSession}>
            New Session
          </button>
        </div>

        <div className="memory-list">
          {filtered.length === 0 && (
            <div className="empty-state">
              <p>No sessions yet. Start a conversation to create one.</p>
            </div>
          )}
          {Object.entries(grouped).map(([date, dateSessions]) => (
            <div key={date} className="memory-date-group">
              <h4 className="date-header">{date}</h4>
              {dateSessions.map((session) => (
                <div
                  key={session.id}
                  className="memory-session-item"
                  onClick={() => onLoadSession(session.id)}
                >
                  <div className="session-info">
                    <span className="session-title">{session.title}</span>
                    <span className="session-meta">
                      {session.messageCount} messages · {formatDate(session.updated)}
                    </span>
                    {session.preview && <p className="session-preview">{session.preview}...</p>}
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="memory-status">
          <span>{sessions.length} total sessions</span>
        </div>
      </div>
    </div>
  )
}
