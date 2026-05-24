import type { Message, PersonalityConfig, ModelLoadProgress, BackendStatus, ProviderConfig, GenerationStats } from '../types'

const DEFAULT_LOCAL_PROVIDER: ProviderConfig = {
  id: 'local',
  name: 'Local (llama.cpp)',
  type: 'local',
}

export class NeuralEngine {
  private status: BackendStatus = 'unloaded'
  private currentModelPath: string | null = null
  private abortController: AbortController | null = null
  private onProgress: ((progress: ModelLoadProgress) => void) | null = null
  private onStatusChange: ((status: BackendStatus) => void) | null = null
  private serverHost = '127.0.0.1'
  private serverPort = 8080
  private provider: ProviderConfig = DEFAULT_LOCAL_PROVIDER

  private get baseUrl() {
    return `http://${this.serverHost}:${this.serverPort}`
  }

  setProgressHandler(handler: (progress: ModelLoadProgress) => void) {
    this.onProgress = handler
  }

  setStatusHandler(handler: (status: BackendStatus) => void) {
    this.onStatusChange = handler
  }

  setProvider(config: ProviderConfig) {
    this.provider = config
    // Non-local providers are always "ready" — no local server needed
    if (config.type !== 'local') {
      this.setStatus('ready')
    }
  }

  getProvider(): ProviderConfig {
    return this.provider
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

  async startServer(modelPath: string, config?: { ctxSize?: number; ngl?: number }): Promise<void> {
    // External providers don't use the local llama-server
    if (this.provider.type !== 'local') {
      this.currentModelPath = modelPath
      this.setStatus('ready')
      return
    }

    await this.stopServer()
    this.setStatus('loading')
    this.currentModelPath = modelPath
    this.reportProgress('starting server', 10, 100)

    const api = window.electronAPI
    if (api) {
      await api.startServer(modelPath, config).catch((err: Error) => {
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
        // connection refused or timeout — server not up yet
      }
      await new Promise((r) => setTimeout(r, delay))
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
    onToken?: (token: string) => void,
    onStats?: (stats: GenerationStats) => void,
    onCompact?: (removedCount: number) => void
  ): Promise<string> {
    const { type } = this.provider

    if (type === 'openai' || type === 'custom') {
      return this.generateOpenAI(messages, systemPrompt, personality, onToken, onStats)
    }
    if (type === 'ollama') {
      return this.generateOllama(messages, systemPrompt, personality, onToken, onStats)
    }
    return this.generateLocal(messages, systemPrompt, personality, onToken, onStats, onCompact)
  }

  // ── Local llama-server (/v1/chat/completions — auto template) ───────────────
  // Uses the OpenAI-compatible endpoint so llama.cpp applies the model's own
  // built-in chat template (read from the GGUF file).  This works correctly
  // for Gemma, Llama, Phi, Mistral, Qwen — any model — without us needing to
  // know or guess the template format.

  private async generateLocal(
    messages: Message[],
    systemPrompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void,
    onStats?: (stats: GenerationStats) => void,
    onCompact?: (removedCount: number) => void
  ): Promise<string> {
    let conversationMessages = messages.filter(m => m.role !== 'system')
    const originalCount = conversationMessages.length

    while (true) {
      try {
        return await this.doLocalChatCompletion(conversationMessages, systemPrompt, personality, onToken, onStats)
      } catch (err) {
        const msg = (err as Error).message
        if (msg.includes('400') && conversationMessages.length > 1) {
          const dropCount = conversationMessages.length >= 2 ? 2 : 1
          conversationMessages = conversationMessages.slice(dropCount)
          onCompact?.(originalCount - conversationMessages.length)
        } else {
          throw err
        }
      }
    }
  }

  private async doLocalChatCompletion(
    messages: Message[],
    systemPrompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void,
    onStats?: (stats: GenerationStats) => void
  ): Promise<string> {
    this.abortController = new AbortController()

    const chatMessages: { role: string; content: string }[] = []
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt })
    for (const m of messages) {
      chatMessages.push({ role: m.role, content: m.content })
    }

    let response = ''
    let localTokenCount = 0
    let genStart = 0

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local',
          messages: chatMessages,
          temperature: personality.temperature,
          max_tokens: personality.maxTokens,
          top_p: personality.topP,
          stream: true,
        }),
        signal: this.abortController.signal,
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`Server error ${res.status}: ${errBody || res.statusText}`)
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
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              if (localTokenCount === 0) genStart = Date.now()
              localTokenCount++
              response += token
              onToken?.(token)
              if (onStats) {
                const elapsed = (Date.now() - genStart) / 1000
                onStats({
                  tokensPerSec: elapsed > 0 ? localTokenCount / elapsed : 0,
                  tokenCount: localTokenCount,
                  promptTokens: parsed.usage?.prompt_tokens ?? 0,
                  elapsedSec: elapsed,
                })
              }
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return response
      const msg = (err as Error).message
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connect')) {
        throw new Error('Cannot reach the local AI server — no model is loaded. Use /models or the model button in the bottom bar to load one.')
      }
      throw err
    }

    return response
  }

  // ── OpenAI-compatible (SSE /v1/chat/completions) ──────────────────────────

  private async generateOpenAI(
    messages: Message[],
    systemPrompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void,
    onStats?: (stats: GenerationStats) => void
  ): Promise<string> {
    this.abortController = new AbortController()
    const { baseUrl, apiKey, model } = this.provider
    const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`

    const chatMessages: { role: string; content: string }[] = []
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt })
    for (const m of messages.filter(m => m.role !== 'system')) {
      chatMessages.push({ role: m.role, content: m.content })
    }

    let response = ''
    let localTokenCount = 0
    let genStart = 0
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: chatMessages,
          temperature: personality.temperature,
          max_tokens: personality.maxTokens,
          top_p: personality.topP,
          stream: true,
        }),
        signal: this.abortController.signal,
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`OpenAI API error ${res.status}: ${errBody || res.statusText}`)
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
            const token = parsed.choices?.[0]?.delta?.content || ''
            if (token) {
              if (localTokenCount === 0) genStart = Date.now()
              localTokenCount++
              response += token
              onToken?.(token)
              if (onStats) {
                const elapsed = (Date.now() - genStart) / 1000
                onStats({ tokensPerSec: elapsed > 0 ? localTokenCount / elapsed : 0, tokenCount: localTokenCount, promptTokens: 0, elapsedSec: elapsed })
              }
            }
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return response
      const msg = (err as Error).message
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connect')) {
        throw new Error(`Cannot reach the OpenAI/custom API — check the base URL and API key in /providers.`)
      }
      throw err
    }

    return response
  }

  // ── Ollama (NDJSON /api/chat) ─────────────────────────────────────────────

  private async generateOllama(
    messages: Message[],
    systemPrompt: string,
    personality: PersonalityConfig,
    onToken?: (token: string) => void,
    onStats?: (stats: GenerationStats) => void
  ): Promise<string> {
    this.abortController = new AbortController()
    const { baseUrl, model } = this.provider
    const url = `${baseUrl || 'http://localhost:11434'}/api/chat`

    const chatMessages: { role: string; content: string }[] = []
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt })
    for (const m of messages.filter(m => m.role !== 'system')) {
      chatMessages.push({ role: m.role, content: m.content })
    }

    let response = ''
    let localTokenCount = 0
    let genStart = 0
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          messages: chatMessages,
          stream: true,
          options: {
            temperature: personality.temperature,
            num_predict: personality.maxTokens,
            top_p: personality.topP,
            top_k: personality.topK,
            repeat_penalty: personality.repeatPenalty,
          },
        }),
        signal: this.abortController.signal,
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`Ollama error ${res.status}: ${errBody || res.statusText}`)
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
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            const token = parsed.message?.content || ''
            if (token) {
              if (localTokenCount === 0) genStart = Date.now()
              localTokenCount++
              response += token
              onToken?.(token)
              if (onStats) {
                const elapsed = (Date.now() - genStart) / 1000
                onStats({ tokensPerSec: elapsed > 0 ? localTokenCount / elapsed : 0, tokenCount: localTokenCount, promptTokens: 0, elapsedSec: elapsed })
              }
            }
            // Ollama final chunk has eval_count and eval_duration (ns)
            if (parsed.done && onStats && parsed.eval_count) {
              const evalSec = (parsed.eval_duration || 0) / 1e9
              onStats({
                tokensPerSec: evalSec > 0 ? parsed.eval_count / evalSec : 0,
                tokenCount: parsed.eval_count,
                promptTokens: parsed.prompt_eval_count ?? 0,
                elapsedSec: ((parsed.load_duration || 0) + (parsed.prompt_eval_duration || 0) + (parsed.eval_duration || 0)) / 1e9,
              })
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return response
      const msg = (err as Error).message
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connect')) {
        throw new Error(`Cannot reach Ollama — make sure the Ollama service is running (ollama serve).`)
      }
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

  private reportProgress(stage: string, progress: number, total: number) {
    this.onProgress?.({ stage, progress, total })
  }
}
