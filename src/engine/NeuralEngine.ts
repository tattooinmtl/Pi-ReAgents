import type { PersonalityConfig, ModelLoadProgress, BackendStatus } from '../types'

export class NeuralEngine {
  private status: BackendStatus = 'unloaded'
  private currentModelPath: string | null = null
  private abortController: AbortController | null = null
  private onProgress: ((progress: ModelLoadProgress) => void) | null = null
  private serverHost = '127.0.0.1'
  private serverPort = 8080

  private get baseUrl() {
    return `http://${this.serverHost}:${this.serverPort}`
  }

  setProgressHandler(handler: (progress: ModelLoadProgress) => void) {
    this.onProgress = handler
  }

  getStatus(): BackendStatus {
    return this.status
  }

  getCurrentModel(): string | null {
    return this.currentModelPath
  }

  async startServer(modelPath: string): Promise<void> {
    this.stopServer()
    this.status = 'loading'
    this.currentModelPath = modelPath
    this.reportProgress('starting server', 10, 100)

    const api = window.electronAPI
    if (api) {
      console.log('[NeuralEngine] Spawning llama-server via Electron IPC')
      await api.startServer(modelPath).catch((err: Error) => {
        console.warn('[NeuralEngine] Spawn failed, trying to connect anyway:', err.message)
      })
    } else {
      console.log('[NeuralEngine] No Electron API — assuming llama-server is already running on :8080')
    }

    await this.waitForServer()

    this.status = 'ready'
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
    this.status = 'unloaded'
    this.currentModelPath = null
  }

  async generate(
    prompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void
  ): Promise<string> {
    this.abortController = new AbortController()
    const fullPrompt = this.buildPrompt(prompt, personality)
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
    await this.stopServer()
    this.abortController?.abort()
    this.abortController = null
  }

  private buildPrompt(userInput: string, personality: PersonalityConfig): string {
    const parts: string[] = []
    if (personality.systemPrompt) {
      parts.push(`<|system|>\n${personality.systemPrompt}`)
    }
    parts.push(`<|user|>\n${userInput}`)
    parts.push('<|assistant|>\n')
    return parts.join('\n')
  }

  private reportProgress(stage: string, progress: number, total: number) {
    this.onProgress?.({ stage, progress, total })
  }
}
