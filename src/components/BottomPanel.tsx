import type { BackendStatus } from '../types'

interface BottomPanelProps {
  status: BackendStatus
  activeModelName: string | undefined
  skillsCount: number
  activeSkillsCount: number
  sessionCount: number
  agentsCount: number
  activeAgentsCount: number
  codeAssistant: boolean
  codingSpace: boolean
  onToggleCodeAssistant: () => void
  onToggleCodingSpace: () => void
  onOpenConsole: () => void
  onOpenTerminal: () => void
  onOpenFiles: () => void
  onOpenPersonality: () => void
  onOpenSkills: () => void
  onOpenModels: () => void
  onOpenMemory: () => void
  onOpenAgents: () => void
  onLoadModel: () => void
  onRestartServer: () => void
}

export function BottomPanel({
  status,
  activeModelName,
  skillsCount,
  activeSkillsCount,
  sessionCount,
  agentsCount,
  activeAgentsCount,
  codeAssistant,
  codingSpace,
  onToggleCodeAssistant,
  onToggleCodingSpace,
  onOpenConsole,
  onOpenTerminal,
  onOpenFiles,
  onOpenPersonality,
  onOpenSkills,
  onOpenModels,
  onOpenMemory,
  onOpenAgents,
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
        <button
          className={`btn btn-tab ${codingSpace ? 'btn-tab-active' : ''}`}
          onClick={onToggleCodingSpace}
          title="Open coding space side panel"
        >
          Coding Space
        </button>
        <button className="btn btn-tab" onClick={onOpenConsole} title="Console logs">
          Console
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
        <button className="btn btn-tab" onClick={onOpenAgents} title="Multi-agent orchestration">
          Agents ({activeAgentsCount}/{agentsCount})
        </button>
      </div>

      <div className="bottom-right">
        <button className="btn btn-sm btn-primary" onClick={onLoadModel} title="Pick a .gguf file">
          Load Model
        </button>
        {activeModelName && (
          <button className="btn btn-sm btn-danger" onClick={onRestartServer} title="Kill and restart llama-server">
            Reload
          </button>
        )}
      </div>
    </div>
  )
}
