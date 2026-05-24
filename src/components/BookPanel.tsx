import { useState } from 'react'
import type { Book, Chapter, ChapterStatus } from '../types'

interface BookPanelProps {
  book: Book | null
  isBuilding: boolean
  openChapterPath?: string | null
  onCreateBook: (title: string, author: string, genre: string, description: string) => void
  onOpenBook: () => void
  onOpenChapter: (filePath: string, chapterName: string) => void
  onAddChapter: (title: string) => void
  onMarkChapter: (chapterId: string, status: ChapterStatus) => void
  onBuildBook: () => void
  onAttachChapterFile: (chapterId: string) => void
  onClose: () => void
}

type Tab = 'overview' | 'chapters' | 'build'

export function BookPanel({
  book,
  isBuilding,
  openChapterPath,
  onCreateBook,
  onOpenBook,
  onOpenChapter,
  onAddChapter,
  onMarkChapter,
  onBuildBook,
  onAttachChapterFile,
  onClose,
}: BookPanelProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newGenre, setNewGenre] = useState('Science Fiction')
  const [newDesc, setNewDesc] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')

  const handleCreate = () => {
    if (!newTitle.trim()) return
    onCreateBook(newTitle.trim(), newAuthor.trim(), newGenre.trim(), newDesc.trim())
    setTab('chapters')
  }

  const handleAddChapter = () => {
    if (!chapterTitle.trim()) return
    onAddChapter(chapterTitle.trim())
    setChapterTitle('')
  }

  const statusLabel: Record<ChapterStatus, string> = {
    outline: '○ Outline',
    draft: '📝 Draft',
    complete: '✅ Complete',
  }

  const statusNext: Record<ChapterStatus, ChapterStatus> = {
    outline: 'draft',
    draft: 'complete',
    complete: 'outline',
  }

  const chaptersDone = book?.chapters.filter(c => c.status === 'complete').length ?? 0
  const chaptersTotal = book?.chapters.length ?? 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content book-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📚 {book ? book.title : 'Book Studio'}</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        <div className="book-tabs">
          {(['overview', 'chapters', 'build'] as Tab[]).map(t => (
            <button
              key={t}
              className={`btn btn-tab ${tab === t ? 'btn-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Overview / Create ─────────────────────────────── */}
        {tab === 'overview' && (
          <div className="book-tab-content">
            {book ? (
              <div className="book-overview">
                <div className="book-meta-grid">
                  <span className="book-meta-label">Title</span>
                  <span className="book-meta-value">{book.title}</span>
                  <span className="book-meta-label">Author</span>
                  <span className="book-meta-value">{book.author || '—'}</span>
                  <span className="book-meta-label">Genre</span>
                  <span className="book-meta-value">{book.genre || '—'}</span>
                  <span className="book-meta-label">Progress</span>
                  <span className="book-meta-value">{chaptersDone} / {chaptersTotal} chapters complete</span>
                  <span className="book-meta-label">Folder</span>
                  <span className="book-meta-value book-path">{book.projectPath}</span>
                </div>
                {book.description && (
                  <p className="book-description">{book.description}</p>
                )}
                <div className="book-progress-bar">
                  <div
                    className="book-progress-fill"
                    style={{ width: chaptersTotal > 0 ? `${(chaptersDone / chaptersTotal) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ) : (
              <div className="book-create-form">
                <p className="book-create-hint">No book open yet. Open an existing project or create a new one below.</p>
                <button className="btn btn-secondary book-open-btn" onClick={onOpenBook}>
                  📂 Open Existing Book…
                </button>
                <div className="book-divider"><span>or create new</span></div>
                <label className="book-field-label">Book Title *</label>
                <input
                  className="book-input"
                  placeholder="e.g. The Hitchhiker's Guide — Volume 2"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                />
                <label className="book-field-label">Author</label>
                <input
                  className="book-input"
                  placeholder="Your name"
                  value={newAuthor}
                  onChange={e => setNewAuthor(e.target.value)}
                />
                <label className="book-field-label">Genre</label>
                <input
                  className="book-input"
                  placeholder="Science Fiction, Fantasy, …"
                  value={newGenre}
                  onChange={e => setNewGenre(e.target.value)}
                />
                <label className="book-field-label">Description</label>
                <textarea
                  className="book-input book-textarea"
                  placeholder="A short description of the story…"
                  value={newDesc}
                  rows={3}
                  onChange={e => setNewDesc(e.target.value)}
                />
                <button
                  className="btn btn-primary book-create-btn"
                  onClick={handleCreate}
                  disabled={!newTitle.trim()}
                >
                  Create Book Project
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Chapters ──────────────────────────────────────── */}
        {tab === 'chapters' && (
          <div className="book-tab-content">
            {!book ? (
              <p className="book-empty">Create a book first in the Overview tab.</p>
            ) : (
              <>
                <div className="book-chapter-list">
                  {book.chapters.length === 0 && (
                    <p className="book-empty">No chapters yet. Add your first chapter below.</p>
                  )}
                  {book.chapters.map((ch: Chapter) => (
                    <div key={ch.id} className={`book-chapter-row ${openChapterPath === ch.filePath ? 'book-chapter-row-active' : ''}`}>
                      <span className="book-chapter-num">Ch.{ch.number}</span>
                      <span className="book-chapter-title">{ch.title}</span>
                      <button
                        className="btn btn-xs book-chapter-status"
                        onClick={() => onMarkChapter(ch.id, statusNext[ch.status])}
                        title="Click to cycle status"
                      >
                        {statusLabel[ch.status]}
                      </button>
                      {ch.filePath && (
                        <button
                          className={`btn btn-xs ${openChapterPath === ch.filePath ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => onOpenChapter(ch.filePath!, `Ch.${ch.number} - ${ch.title}`)}
                          title="Open in Code Space editor"
                        >
                          📝
                        </button>
                      )}
                      <button
                        className="btn btn-xs"
                        onClick={() => onAttachChapterFile(ch.id)}
                        title="Attach existing file content to this chapter"
                      >
                        📎
                      </button>
                    </div>
                  ))}
                </div>
                <div className="book-add-chapter">
                  <input
                    className="book-input"
                    placeholder="New chapter title…"
                    value={chapterTitle}
                    onChange={e => setChapterTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddChapter() }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleAddChapter}
                    disabled={!chapterTitle.trim()}
                  >
                    + Add Chapter
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Build ─────────────────────────────────────────── */}
        {tab === 'build' && (
          <div className="book-tab-content">
            {!book ? (
              <p className="book-empty">Create a book first in the Overview tab.</p>
            ) : (
              <div className="book-build-section">
                <p className="book-build-info">
                  The AI will read all {book.chapters.length} chapter file{book.chapters.length !== 1 ? 's' : ''} and write the complete, polished book — applying proper narrative structure, consistent voice, smooth transitions, and genre conventions.
                </p>
                <div className="book-build-checklist">
                  {book.chapters.map(ch => (
                    <div key={ch.id} className="book-build-ch-row">
                      <span className={`book-build-dot ${ch.status === 'complete' ? 'dot-green' : ch.status === 'draft' ? 'dot-yellow' : 'dot-gray'}`} />
                      <span>Ch.{ch.number}: {ch.title}</span>
                      <span className="book-build-ch-status">{ch.status}</span>
                    </div>
                  ))}
                </div>
                {book.chapters.length === 0 && (
                  <p className="book-empty">Add chapters first.</p>
                )}
                <button
                  className="btn btn-primary book-build-btn"
                  onClick={onBuildBook}
                  disabled={isBuilding || book.chapters.length === 0}
                >
                  {isBuilding ? '⏳ Building…' : '🔨 Build Full Book'}
                </button>
                <p className="book-build-hint">
                  Tip: you can also type <code>/build book</code> in the chat at any time.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
