import type { Message, PersonalityConfig, ModelLoadProgress, BackendStatus, ChatTemplate } from '../types'

export class NeuralEngine {
  private status: BackendStatus = 'unloaded'
  private currentModelPath: string | null = null
  private abortController: AbortController | null = null
  private onProgress: ((progress: ModelLoadProgress) => void) | null = null
  private onStatusChange: ((status: BackendStatus) => void) | null = null
  private serverHost = '127.0.0.1'
  private serverPort = 8080
  private chatTemplate: ChatTemplate = 'zephyr'

  private get baseUrl() {
    return `http://${this.serverHost}:${this.serverPort}`
  }

  setProgressHandler(handler: (progress: ModelLoadProgress) => void) {
    this.onProgress = handler
  }

  // Register a callback invoked on every internal status transition so React
  // state stays in sync without polling.
  setStatusHandler(handler: (status: BackendStatus) => void) {
    this.onStatusChange = handler
  }

  getStatus(): BackendStatus {
    return this.status
  }

  getCurrentModel(): string | null {
    return this.currentModelPath
  }

  private setStatus(status: BackendStatus) {
    this.status = status
    this.onStatusChange?.(status)
  }

  async startServer(modelPath: string, template?: ChatTemplate): Promise<void> {
    await this.stopServer()
    this.setStatus('loading')
    this.currentModelPath = modelPath
    if (template) this.chatTemplate = template
    this.reportProgress('starting server', 10, 100)

    const api = window.electronAPI
    if (api) {
      await api.startServer(modelPath).catch((err: Error) => {
        console.warn('[NeuralEngine] Spawn failed, trying to connect anyway:', err.message)
      })
    }

    try {
      await this.waitForServer()
    } catch (err) {
      this.setStatus('error')
      this.currentModelPath = null
      throw err
    }

    this.setStatus('ready')
    this.reportProgress('ready', 100, 100)
  }

  private async waitForServer(retries = 30, delay = 1000): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
        if (res.ok) return
      } catch {
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw new Error('Server failed to start within timeout')
  }

  async stopServer(): Promise<void> {
    const api = window.electronAPI
    if (api) await api.stopServer().catch(() => {})
    this.setStatus('unloaded')
    this.currentModelPath = null
  }

  async generate(
    messages: Message[],
    systemPrompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void
  ): Promise<string> {
    this.abortController = new AbortController()
    const fullPrompt = this.buildPrompt(messages, systemPrompt)
    let response = ''

    try {
      const res = await fetch(`${this.baseUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          temperature: personality.temperature,
          top_p: personality.topP,
          top_k: personality.topK,
          repeat_penalty: personality.repeatPenalty,
          n_predict: personality.maxTokens,
          cache_prompt: true,
          stream: true,
          mirostat: personality.mirostat ? 2 : 0,
          mirostat_tau: personality.mirostatTau,
          mirostat_eta: personality.mirostatEta,
          n_ctx: personality.contextLength,
        }),
        signal: this.abortController.signal,
      })

      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            const token = parsed.content || ''
            response += token
            onToken?.(token)
          } catch {
            response += data
            onToken?.(data)
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return response
      throw err
    }

    return response
  }

  stopGeneration() {
    this.abortController?.abort()
    this.abortController = null
  }

  async unloadModel() {
    this.abortController?.abort()
    this.abortController = null
    await this.stopServer()
  }

  private buildPrompt(messages: Message[], systemPrompt: string): string {
    const template = this.chatTemplate
    const conversationMessages = messages.filter((m) => m.role !== 'system')

    if (template === 'chatml') {
      const parts: string[] = []
      if (systemPrompt) parts.push(`<|im_start|>system\n${systemPrompt}<|im_end|>`)
      for (const msg of conversationMessages) {
        parts.push(`<|im_start|>${msg.role}\n${msg.content}<|im_end|>`)
      }
      parts.push('<|im_start|>assistant')
      return parts.join('\n')
    }

    if (template === 'llama2') {
      let prompt = ''
      for (let i = 0; i < conversationMessages.length; i++) {
        const msg = conversationMessages[i]
        if (msg.role === 'user') {
          const sysBlock = i === 0 && systemPrompt ? `<<SYS>>\n${systemPrompt}\n<</SYS>>\n\n` : ''
          prompt += `[INST] ${sysBlock}${msg.content} [/INST]`
        } else if (msg.role === 'assistant') {
          prompt += ` ${msg.content} `
        }
      }
      return prompt
    }

    if (template === 'phi3') {
      const parts: string[] = []
      if (systemPrompt) parts.push(`<|system|>\n${systemPrompt}<|end|>`)
      for (const msg of conversationMessages) {
        parts.push(`<|${msg.role}|>\n${msg.content}<|end|>`)
      }
      parts.push('<|assistant|>')
      return parts.join('\n')
    }

    if (template === 'raw') {
      const parts: string[] = []
      if (systemPrompt) parts.push(systemPrompt)
      for (const msg of conversationMessages) {
        parts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      }
      parts.push('Assistant:')
      return parts.join('\n\n')
    }

    // default: zephyr  <|system|> / <|user|> / <|assistant|>
    const parts: string[] = []
    if (systemPrompt) parts.push(`<|system|>\n${systemPrompt}`)
    for (const msg of conversationMessages) {
      parts.push(`<|${msg.role}|>\n${msg.content}`)
    }
    parts.push('<|assistant|>')
    return parts.join('\n')
  }

  private reportProgress(stage: string, progress: number, total: number) {
    this.onProgress?.({ stage, progress, total })
  }
}
