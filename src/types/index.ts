export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
}

export interface PersonalityConfig {
  temperature: number
  topP: number
  topK: number
  repeatPenalty: number
  maxTokens: number
  systemPrompt: string
  contextLength: number
  mirostat: boolean
  mirostatTau: number
  mirostatEta: number
}

export interface Skill {
  id: string
  name: string
  description: string
  content: string
  path: string
  enabled: boolean
  tags: string[]
  version: string
}

export type ChatTemplate = 'zephyr' | 'chatml' | 'llama2' | 'phi3' | 'raw'

export interface ModelConfig {
  id: string
  name: string
  path: string
  source: 'local' | 'huggingface'
  huggingfaceRepo?: string
  filename?: string
  size?: number
  quantization?: string
  loaded: boolean
  chatTemplate?: ChatTemplate
}

export interface MemorySession {
  id: string
  title: string
  created: string
  updated: string
  messageCount: number
  preview: string
}

export interface ModelLoadProgress {
  stage: string
  progress: number
  total: number
}

export interface GenerationStats {
  tokensPerSec: number
  tokenCount: number
  promptTokens: number
  elapsedSec: number
}

export type BackendStatus = 'unloaded' | 'loading' | 'ready' | 'error'

export type ProviderType = 'local' | 'openai' | 'ollama' | 'custom'

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl?: string
  apiKey?: string
  model?: string
}

// ── Agent System ──────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'skipped'

export interface AgentDefinition {
  id: string
  name: string
  description: string
  systemPrompt: string
  enabled: boolean
  icon: string
  maxTokens?: number
  temperature?: number
}

export interface AgentTask {
  agentId: string
  taskDescription: string
  contextSnippet?: string
  priority: number
}

export interface AgentResult {
  agentId: string
  agentName: string
  status: AgentStatus
  output: string
  partialOutput: string
  startedAt: number
  finishedAt?: number
  error?: string
}

export type OrchestrationPhase = 'decomposing' | 'dispatching' | 'synthesizing' | 'done' | 'error'

export interface OrchestrationSession {
  id: string
  userMessage: string
  tasks: AgentTask[]
  results: AgentResult[]
  synthesisOutput: string
  startedAt: number
  finishedAt?: number
  phase: OrchestrationPhase
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  expanded?: boolean
  children?: FileNode[]
}

export interface OpenFile {
  path: string
  name: string
  content: string
  modified: boolean
}

export interface ContextFile {
  path: string
  name: string
  content: string
}

export type ChapterStatus = 'outline' | 'draft' | 'complete'

export interface Chapter {
  id: string
  number: number
  title: string
  summary?: string
  filePath?: string
  status: ChapterStatus
}

export interface Book {
  id: string
  title: string
  author: string
  genre: string
  description: string
  chapters: Chapter[]
  projectPath: string
  createdAt: number
  updatedAt: number
}
