import { useState } from 'react'
import type { ProviderConfig, ProviderType } from '../types'

const PROVIDER_PRESETS: { label: string; type: ProviderType; baseUrl: string; modelHint: string }[] = [
  { label: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', modelHint: 'gpt-4o-mini' },
  { label: 'LM Studio', type: 'openai', baseUrl: 'http://localhost:1234', modelHint: 'local-model' },
  { label: 'Ollama', type: 'ollama', baseUrl: 'http://localhost:11434', modelHint: 'llama3' },
  { label: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai', modelHint: 'llama-3.1-70b-versatile' },
  { label: 'Together AI', type: 'openai', baseUrl: 'https://api.together.xyz', modelHint: 'meta-llama/Llama-3-8b-chat-hf' },
  { label: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api', modelHint: 'openai/gpt-4o-mini' },
  { label: 'Custom URL', type: 'custom', baseUrl: '', modelHint: '' },
]

interface ProvidersPanelProps {
  providers: ProviderConfig[]
  activeProvider: ProviderConfig
  onSelectProvider: (provider: ProviderConfig) => void
  onAddProvider: (provider: ProviderConfig) => void
  onRemoveProvider: (id: string) => void
  onClose: () => void
}

export function ProvidersPanel({
  providers,
  activeProvider,
  onSelectProvider,
  onAddProvider,
  onRemoveProvider,
  onClose,
}: ProvidersPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [preset, setPreset] = useState(PROVIDER_PRESETS[0])
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS[0].baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(PROVIDER_PRESETS[0].modelHint)

  const applyPreset = (p: typeof PROVIDER_PRESETS[0]) => {
    setPreset(p)
    setBaseUrl(p.baseUrl)
    setModel(p.modelHint)
    if (!name) setName(p.label)
  }

  const handleAdd = () => {
    if (!name.trim()) return
    const id = `provider-${Date.now()}`
    onAddProvider({
      id,
      name: name.trim(),
      type: preset.type,
      baseUrl: baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
    })
    setShowForm(false)
    setName('')
    setApiKey('')
    setModel('')
    setBaseUrl(PROVIDER_PRESETS[0].baseUrl)
    setPreset(PROVIDER_PRESETS[0])
  }

  const typeLabel: Record<ProviderType, string> = {
    local: 'Local llama.cpp',
    openai: 'OpenAI-compatible',
    ollama: 'Ollama',
    custom: 'Custom',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content providers-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI Providers</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        <div className="providers-list">
          {providers.map((p) => (
            <div
              key={p.id}
              className={`provider-item ${activeProvider.id === p.id ? 'active' : ''}`}
            >
              <div className="provider-info">
                <span className="provider-name">{p.name}</span>
                <span className="provider-type">{typeLabel[p.type]}</span>
                {p.model && <span className="provider-model">{p.model}</span>}
                {p.baseUrl && p.type !== 'local' && (
                  <span className="provider-url">{p.baseUrl}</span>
                )}
              </div>
              <div className="provider-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onSelectProvider(p)}
                  disabled={activeProvider.id === p.id}
                >
                  {activeProvider.id === p.id ? 'Active' : 'Use'}
                </button>
                {p.id !== 'local' && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => onRemoveProvider(p.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {showForm ? (
          <div className="provider-form">
            <h3>Add Provider</h3>

            <div className="provider-presets">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`btn btn-sm ${preset.label === p.label ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="form-row">
              <label>Name</label>
              <input
                type="text"
                className="search-input"
                placeholder="My Provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {preset.type !== 'ollama' && (
              <div className="form-row">
                <label>API Key</label>
                <input
                  type="password"
                  className="search-input"
                  placeholder="sk-... (leave blank if not needed)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            )}

            <div className="form-row">
              <label>Base URL</label>
              <input
                type="text"
                className="search-input"
                placeholder="https://api.openai.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Model</label>
              <input
                type="text"
                className="search-input"
                placeholder={preset.modelHint || 'model-name'}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleAdd} disabled={!name.trim()}>
                Add Provider
              </button>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 16px' }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Add Provider
            </button>
          </div>
        )}

        <div className="model-status">
          <span className="status-ready">Active: {activeProvider.name}</span>
        </div>
      </div>
    </div>
  )
}
