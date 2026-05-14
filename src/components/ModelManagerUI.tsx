import { useState } from 'react'
import type { ModelConfig } from '../types'

interface ModelManagerUIProps {
  models: ModelConfig[]
  activeModel: ModelConfig | undefined
  onSelectModel: (id: string) => void
  onDownloadHF: (repoId: string, filename: string) => void
  onRemoveModel: (id: string) => void
  onClose: () => void
}

const SUGGESTED_MODELS = [
  { repo: 'TheBloke/Llama-2-7B-Chat-GGUF', file: 'llama-2-7b-chat.Q4_K_M.gguf' },
  { repo: 'TheBloke/Llama-2-13B-Chat-GGUF', file: 'llama-2-13b-chat.Q4_K_M.gguf' },
  { repo: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF', file: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf' },
  { repo: 'TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF', file: 'mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf' },
  { repo: 'TheBloke/CodeLlama-7B-Instruct-GGUF', file: 'codellama-7b-instruct.Q4_K_M.gguf' },
  { repo: 'microsoft/Phi-3-mini-4k-instruct-gguf', file: 'Phi-3-mini-4k-instruct-q4.gguf' },
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

  const handleDownload = () => {
    if (!hfRepo || !hfFile) return
    onDownloadHF(hfRepo.trim(), hfFile.trim())
    setHfRepo('')
    setHfFile('')
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
            {models.filter(m => m.source === 'local').map((model) => (
              <div
                key={model.id}
                className={`model-item ${activeModel?.id === model.id ? 'active' : ''}`}
              >
                <div className="model-info">
                  <span className="model-name">{model.name}</span>
                  {model.quantization && <span className="model-quant">{model.quantization}</span>}
                  {model.chatTemplate && <span className="model-quant">{model.chatTemplate}</span>}
                </div>
                <div className="model-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onSelectModel(model.id)}
                    disabled={activeModel?.id === model.id}
                  >
                    {activeModel?.id === model.id ? 'Active' : 'Load'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => onRemoveModel(model.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
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
                      <span className="suggested-file">{m.file}</span>
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
