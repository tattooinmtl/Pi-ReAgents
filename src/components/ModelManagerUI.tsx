import { useState } from 'react'
import type { ModelConfig } from '../types'
import type { ModelAutoConfig } from '../types/electron'

interface ModelManagerUIProps {
  models: ModelConfig[]
  activeModel: ModelConfig | undefined
  onSelectModel: (id: string, autoConfig?: { ctxSize: number; ngl: number }) => void
  onDownloadHF: (repoId: string, filename: string) => void
  onRemoveModel: (id: string) => void
  onClose: () => void
}

const SUGGESTED_MODELS = [
  // ── Creative Writing / Storytelling ─────────────────────────────────────────
  { repo: 'DreamFast/gemma-3-12b-it-heretic-v2', file: 'gguf/gemma-3-12b-it-heretic-v2-Q3_K_M.gguf', tag: 'story · smallest · ~5.5 GB' },
  { repo: 'DreamFast/gemma-3-12b-it-heretic-v2', file: 'gguf/gemma-3-12b-it-heretic-v2-Q4_K_M.gguf', tag: 'story · recommended · ~7.5 GB' },
  // ── General Purpose ──────────────────────────────────────────────────────────
  { repo: 'Jackrong/Qwen3.5-9B-DeepSeek-V4-Flash-GGUF', file: 'Qwen3.5-9B-DeepSeek-V4-Flash-Q4_K_M.gguf', tag: 'general · ~5.4 GB' },
  { repo: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF', file: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf', tag: 'general · ~4.1 GB' },
  { repo: 'TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF', file: 'mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf', tag: 'general · ~26 GB' },
  { repo: 'TheBloke/Llama-2-7B-Chat-GGUF', file: 'llama-2-7b-chat.Q4_K_M.gguf', tag: 'general · ~3.8 GB' },
  { repo: 'TheBloke/Llama-2-13B-Chat-GGUF', file: 'llama-2-13b-chat.Q4_K_M.gguf', tag: 'general · ~7.3 GB' },
  { repo: 'TheBloke/CodeLlama-7B-Instruct-GGUF', file: 'codellama-7b-instruct.Q4_K_M.gguf', tag: 'code · ~3.8 GB' },
  { repo: 'microsoft/Phi-3-mini-4k-instruct-gguf', file: 'Phi-3-mini-4k-instruct-q4.gguf', tag: 'tiny · ~2.1 GB' },
]

export function ModelManagerUI({
  models,
  activeModel,
  onSelectModel,
  onDownloadHF,
  onRemoveModel,
  onClose,
}: ModelManagerUIProps) {
  const [hfRepo, setHfRepo] = useState('')
  const [hfFile, setHfFile] = useState('')
  const [showSuggested, setShowSuggested] = useState(true)
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, ModelAutoConfig>>({})

  const handleDownload = () => {
    if (!hfRepo || !hfFile) return
    onDownloadHF(hfRepo.trim(), hfFile.trim())
    setHfRepo('')
    setHfFile('')
  }

  const handleLoad = async (model: ModelConfig) => {
    setScanning(model.id)
    let autoConfig: ModelAutoConfig | undefined
    try {
      if (window.electronAPI?.scanModel && model.path) {
        autoConfig = await window.electronAPI.scanModel(model.path)
        setScanResults(prev => ({ ...prev, [model.id]: autoConfig! }))
      }
    } catch {}
    setScanning(null)
    onSelectModel(model.id, autoConfig ? { ctxSize: autoConfig.ctxSize, ngl: autoConfig.ngl } : undefined)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content model-manager" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Model Manager</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        <div className="model-section">
          <h3>Local Models</h3>

          <div className="model-list">
            {models.filter(m => m.source === 'local').map((model) => {
              const isActive   = activeModel?.id === model.id
              const isScanning = scanning === model.id
              const scan       = scanResults[model.id]
              return (
                <div key={model.id} className={`model-item ${isActive ? 'active' : ''}`}>
                  <div className="model-info">
                    <span className="model-name">{model.name}</span>
                    {model.quantization && <span className="model-quant">{model.quantization}</span>}
                    {(scan?.chatTemplate ?? model.chatTemplate) && (
                      <span className="model-quant">{scan?.chatTemplate ?? model.chatTemplate}</span>
                    )}
                    {scan && (
                      <span className="model-quant" title={scan.hardware.gpuName || 'CPU only'}>
                        ctx {(scan.ctxSize / 1024).toFixed(0)}k
                        {scan.ngl > 0 ? ' · GPU' : ' · CPU'}
                        {scan.nativeContextLength ? ` · native ${(scan.nativeContextLength / 1024).toFixed(0)}k` : ''}
                      </span>
                    )}
                  </div>
                  <div className="model-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleLoad(model)}
                      disabled={isActive || isScanning}
                    >
                      {isActive ? 'Active' : isScanning ? 'Scanning…' : 'Load'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => onRemoveModel(model.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
            {models.filter(m => m.source === 'local').length === 0 && (
              <p className="empty-hint">No local models found. Scan a folder or download one below.</p>
            )}
          </div>
        </div>

        <div className="model-section">
          <h3>Hugging Face Download</h3>
          <div className="hf-input-row">
            <input
              type="text"
              placeholder="Repo ID (e.g. TheBloke/Mistral-7B-GGUF)"
              value={hfRepo}
              onChange={(e) => setHfRepo(e.target.value)}
              className="search-input"
            />
            <input
              type="text"
              placeholder="Filename (e.g. model.q4_k_m.gguf)"
              value={hfFile}
              onChange={(e) => setHfFile(e.target.value)}
              className="search-input"
            />
            <button className="btn btn-primary" onClick={handleDownload} disabled={!hfRepo || !hfFile}>
              Download
            </button>
          </div>

          <div className="suggested-models">
            <div className="suggested-header" onClick={() => setShowSuggested(!showSuggested)}>
              <span>Suggested Models</span>
              <span>{showSuggested ? '▲' : '▼'}</span>
            </div>
            {showSuggested && (
              <div className="suggested-list">
                {SUGGESTED_MODELS.map((m) => (
                  <div key={m.repo + m.file} className="suggested-item">
                    <div className="suggested-info">
                      <span className="suggested-repo">{m.repo}</span>
                      <span className="suggested-file">{m.file.split('/').pop()}</span>
                      {m.tag && <span className="suggested-tag">{m.tag}</span>}
                    </div>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => onDownloadHF(m.repo, m.file)}
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="model-status">
          {activeModel ? (
            <span className="status-ready">Active: {activeModel.name}</span>
          ) : (
            <span className="status-idle">No model loaded</span>
          )}
        </div>
      </div>
    </div>
  )
}
