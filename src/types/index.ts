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

export type BackendStatus = 'unloaded' | 'loading' | 'ready' | 'error'

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
