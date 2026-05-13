import type { BackendStatus } from '../types'

interface BottomPanelProps {
  status: BackendStatus
  activeModelName: string | undefined
  skillsCount: number
  activeSkillsCount: number
  sessionCount: number
  codeAssistant: boolean
  onToggleCodeAssistant: () => void
  onOpenTerminal: () => void
  onOpenFiles: () => void
  onOpenPersonality: () => void
  onOpenSkills: () => void
  onOpenModels: () => void
  onOpenMemory: () => void
  onLoadModel: () => void
  onRestartServer: () => void
}

export function BottomPanel({
  status,
  activeModelName,
  skillsCount,
  activeSkillsCount,
  sessionCount,
  codeAssistant,
  onToggleCodeAssistant,
  onOpenTerminal,
  onOpenFiles,
  onOpenPersonality,
  onOpenSkills,
  onOpenModels,
  onOpenMemory,
  onLoadModel,
  onRestartServer,
}: BottomPanelProps) {
  const statusLabel = {
    unloaded: 'No Model',
    loading: 'Loading...',
    ready: 'Ready',
    error: 'Error',
  }

  const statusClass = {
    unloaded: 'status-unloaded',
    loading: 'status-loading',
    ready: 'status-ready',
    error: 'status-error',
  }

  return (
    <div className="bottom-panel">
      <div className="bottom-left">
        <span className={`status-indicator ${statusClass[status]}`}>
          {statusLabel[status]}
        </span>
        {activeModelName && <span className="model-name-label">{activeModelName}</span>}
      </div>

      <div className="bottom-center">
        <button
          className={`btn btn-tab ${codeAssistant ? 'btn-tab-active' : ''}`}
          onClick={onToggleCodeAssistant}
          title="Toggle code assistant mode"
        >
          Code {codeAssistant ? 'ON' : 'OFF'}
        </button>
        <button className="btn btn-tab" onClick={onOpenTerminal} title="Terminal">
          Terminal
        </button>
        <button className="btn btn-tab" onClick={onOpenFiles} title="File explorer">
          Files
        </button>
        <button className="btn btn-tab" onClick={onOpenPersonality} title="Personality Settings">
          Personality
        </button>
        <button className="btn btn-tab" onClick={onOpenSkills} title="Skills Manager">
          Skills ({activeSkillsCount}/{skillsCount})
        </button>
        <button className="btn btn-tab" onClick={onOpenModels} title="Model Manager">
          Models
        </button>
        <button className="btn btn-tab" onClick={onOpenMemory} title="Memory Sessions">
          Memory ({sessionCount})
        </button>
      </div>

      <div className="bottom-right">
        <button className="btn btn-sm btn-primary" onClick={onLoadModel} title="Pick a .gguf file">
          Load Model
        </button>
        {activeModelName && (
          <button className="btn btn-sm btn-danger" onClick={onRestartServer} title="Kill and restart llama-server">
            Restart Server
          </button>
        )}
      </div>
    </div>
  )
}
