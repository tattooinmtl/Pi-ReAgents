import type { MemorySession, Message } from '../types'

export class MemoryManager {
  private baseDir: string = ''
  private currentSession: MemorySession | null = null
  private sessions: Map<string, MemorySession> = new Map()

  constructor(baseDir?: string) {
    if (baseDir) this.baseDir = baseDir
  }

  setBaseDir(dir: string) {
    this.baseDir = dir
  }

  async initialize(): Promise<void> {
    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    await this.ensureDir(this.baseDir)
    await this.scanSessions()
  }

  // Call when the user starts a new chat so the next saveMessage creates a
  // fresh session instead of appending to the previous one.
  resetSession(): void {
    this.currentSession = null
  }

  async createSession(title?: string): Promise<MemorySession> {
    const now = new Date()
    const dateStr = this.formatDateStamp(now)
    const timeStr = this.formatTimeStamp(now)
    const id = `${dateStr}_${timeStr}`

    const session: MemorySession = {
      id,
      title: title || `Session ${dateStr} ${timeStr}`,
      created: now.toISOString(),
      updated: now.toISOString(),
      messageCount: 0,
      preview: '',
    }

    const api = window.electronAPI
    if (api) {
      const dir = `${this.baseDir}\\${dateStr}`
      try {
        await this.ensureDir(dir)
      } catch {
        // If dir creation fails the session is still tracked in memory;
        // saveMessage will retry the dir creation.
      }
    }

    this.sessions.set(id, session)
    this.currentSession = session
    return session
  }

  async saveMessage(message: Message): Promise<void> {
    if (!this.currentSession) {
      await this.createSession()
    }

    const session = this.currentSession!
    session.messageCount++
    session.updated = new Date().toISOString()
    session.preview = message.content.slice(0, 100)

    this.sessions.set(session.id, session)

    const api = window.electronAPI
    if (api) {
      const dateStr = this.extractDate(session.id)
      const dir = `${this.baseDir}\\${dateStr}`
      await this.ensureDir(dir)

      const filePath = `${dir}\\${session.id}.md`
      const existing = await this.readSessionFile(filePath).catch(() => '')
      const entry = this.formatMessageEntry(message)
      await api.writeFile(filePath, existing + entry)
    }
  }

  async loadSession(sessionId: string): Promise<Message[]> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    this.currentSession = session
    const dateStr = this.extractDate(sessionId)
    const filePath = `${this.baseDir}\\${dateStr}\\${sessionId}.md`

    const content = await this.readSessionFile(filePath)
    return this.parseSessionFile(content)
  }

  async listSessions(): Promise<MemorySession[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
    )
  }

  getCurrentSession(): MemorySession | null {
    return this.currentSession
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null
    }

    const api = window.electronAPI
    if (api) {
      const dateStr = this.extractDate(sessionId)
      const filePath = `${this.baseDir}\\${dateStr}\\${sessionId}.md`
      try {
        await api.deleteEntry(filePath)
      } catch {
        // file may not exist
      }
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    const api = window.electronAPI
    if (!api) return

    try {
      await api.readDirectory(dir)
    } catch {
      await api.createDirectory(dir)
    }
  }

  private async scanSessions(): Promise<void> {
    const api = window.electronAPI
    if (!api) return

    try {
      const dateDirs = await api.readDirectory(this.baseDir)

      for (const dir of dateDirs) {
        if (!dir.match(/^\d{4}-\d{2}-\d{2}$/)) continue

        const dirPath = `${this.baseDir}\\${dir}`
        const files = await api.readDirectory(dirPath)
        const mdFiles = files.filter((f: string) => f.endsWith('.md') && f !== '.gitkeep')

        for (const file of mdFiles) {
          const sessionId = file.replace('.md', '')
          const filePath = `${dirPath}\\${file}`
          const content = await this.readSessionFile(filePath)
          const messages = this.parseSessionFile(content)
          if (messages.length === 0) continue

          const firstMsg = messages[0]

          const session: MemorySession = {
            id: sessionId,
            title: firstMsg?.content.slice(0, 50) || sessionId,
            created: firstMsg?.timestamp
              ? new Date(firstMsg.timestamp).toISOString()
              : new Date().toISOString(),
            updated: messages.length > 0
              ? new Date(messages[messages.length - 1].timestamp).toISOString()
              : new Date().toISOString(),
            messageCount: messages.length,
            preview: messages[messages.length - 1]?.content.slice(0, 100) || '',
          }

          this.sessions.set(sessionId, session)
        }
      }
    } catch {
      // directory may not exist yet
    }
  }

  private async readSessionFile(filePath: string): Promise<string> {
    const api = window.electronAPI
    if (!api) return ''
    try {
      return await api.readFile(filePath)
    } catch {
      return ''
    }
  }

  private parseSessionFile(content: string): Message[] {
    const messages: Message[] = []
    const blocks = content.split('\n---\n')

    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed) continue

      const idMatch = trimmed.match(/^id:\s*(.+)/m)
      const roleMatch = trimmed.match(/^role:\s*(\w+)/m)
      const contentMatch = trimmed.match(/^content:\n([\s\S]*)$/m)
      const timeMatch = trimmed.match(/^timestamp:\s*(\d+)/m)
      const modelMatch = trimmed.match(/^model:\s*(.+)/m)

      if (roleMatch && contentMatch) {
        const timestamp = timeMatch ? parseInt(timeMatch[1]) : Date.now()
        messages.push({
          id: idMatch?.[1] || `msg-${timestamp}-${messages.length}`,
          role: roleMatch[1] as 'user' | 'assistant' | 'system',
          content: contentMatch[1].trim(),
          timestamp,
          model: modelMatch?.[1] || undefined,
        })
      }
    }

    return messages
  }

  private formatMessageEntry(message: Message): string {
    const parts = [
      `id: ${message.id}`,
      `role: ${message.role}`,
      `timestamp: ${message.timestamp}`,
    ]
    if (message.model) parts.push(`model: ${message.model}`)
    parts.push('content:\n' + message.content)
    return parts.join('\n') + '\n---\n'
  }

  private formatDateStamp(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  private formatTimeStamp(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
  }

  private extractDate(sessionId: string): string {
    return sessionId.split('_')[0] || this.formatDateStamp(new Date())
  }
}
