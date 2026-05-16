import { useState } from 'react'
import type { AgentDefinition, OrchestrationSession } from '../types'
import { AgentTaskView } from './AgentTaskView'
import { BUILT_IN_AGENT_IDS } from '../agents/agentTemplates'

interface AgentsPanelProps {
  agents: AgentDefinition[]
  activeSession: OrchestrationSession | null
  onToggleAgent: (id: string) => void
  onUpdateAgent: (def: AgentDefinition) => void
  onAddAgent: (def: AgentDefinition) => void
  onRemoveAgent: (id: string) => void
  onClose: () => void
}

const PHASE_LABEL: Record<string, string> = {
  decomposing:  'Analyzing task…',
  dispatching:  'Running agents…',
  synthesizing: 'Synthesizing results…',
  done:         'Complete',
  error:        'Error occurred',
}

export function AgentsPanel({
  agents,
  activeSession,
  onToggleAgent,
  onUpdateAgent,
  onAddAgent,
  onRemoveAgent,
  onClose,
}: AgentsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<AgentDefinition | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDraft, setNewDraft] = useState<Partial<AgentDefinition>>({ icon: '🤖', enabled: true })

  const startEdit = (def: AgentDefinition) => {
    setEditingId(def.id)
    setEditDraft({ ...def })
  }

  const saveEdit = () => {
    if (editDraft) onUpdateAgent(editDraft)
    setEditingId(null)
    setEditDraft(null)
  }

  const handleAddNew = () => {
    if (!newDraft.name?.trim() || !newDraft.systemPrompt?.trim()) return
    onAddAgent({
      id: `agent-${Date.now()}`,
      name: newDraft.name.trim(),
      description: newDraft.description?.trim() ?? '',
      systemPrompt: newDraft.systemPrompt.trim(),
      icon: newDraft.icon ?? '🤖',
      enabled: true,
      temperature: newDraft.temperature,
      maxTokens: newDraft.maxTokens,
    })
    setShowAddForm(false)
    setNewDraft({ icon: '🤖', enabled: true })
  }

  const isRunning = activeSession && activeSession.phase !== 'done' && activeSession.phase !== 'error'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content agents-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Agents</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        {/* ── Live orchestration session ───────────────────────────────── */}
        {activeSession && (
          <div className="orchestration-session">
            <div className="orchestration-phase">
              <span className="phase-label">
                {PHASE_LABEL[activeSession.phase] ?? activeSession.phase}
              </span>
              {isRunning && <span className="phase-spinner" />}
            </div>

            {activeSession.results.length > 0 && (
              <div className="agent-tasks-list">
                {activeSession.results.map((result) => (
                  <AgentTaskView
                    key={result.agentId}
                    result={result}
                    definition={agents.find((a) => a.id === result.agentId)}
                  />
                ))}
              </div>
            )}

            {activeSession.synthesisOutput && (
              <div className="synthesis-output">
                <h4>Synthesis</h4>
                <pre className="agent-task-text">{activeSession.synthesisOutput}</pre>
              </div>
            )}
          </div>
        )}

        {/* ── Agent configuration list ─────────────────────────────────── */}
        <div className="agents-config-list">
          <h3>Configured Agents</h3>
          {agents.map((def) => (
            <div key={def.id} className="agent-config-item">
              {editingId === def.id && editDraft ? (
                <div className="agent-edit-form">
                  <div className="form-row" style={{ flexDirection: 'row', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label>Icon</label>
                      <input
                        className="search-input"
                        style={{ width: 56 }}
                        value={editDraft.icon}
                        onChange={(e) => setEditDraft({ ...editDraft, icon: e.target.value })}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label>Name</label>
                      <input
                        className="search-input"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <label>Description</label>
                    <input
                      className="search-input"
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                    />
                  </div>
                  <div className="form-row">
                    <label>System Prompt</label>
                    <textarea
                      className="search-input"
                      rows={7}
                      style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                      value={editDraft.systemPrompt}
                      onChange={(e) => setEditDraft({ ...editDraft, systemPrompt: e.target.value })}
                    />
                  </div>
                  <div className="form-row" style={{ flexDirection: 'row', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label>Temperature</label>
                      <input
                        type="number" step="0.1" min="0.01" max="2"
                        className="search-input" style={{ width: 80 }}
                        value={editDraft.temperature ?? ''}
                        onChange={(e) => setEditDraft({
                          ...editDraft,
                          temperature: e.target.value ? parseFloat(e.target.value) : undefined,
                        })}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label>Max Tokens</label>
                      <input
                        type="number" step="128" min="128"
                        className="search-input" style={{ width: 100 }}
                        value={editDraft.maxTokens ?? ''}
                        onChange={(e) => setEditDraft({
                          ...editDraft,
                          maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined,
                        })}
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={saveEdit}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="agent-config-row">
                  <span className="agent-icon">{def.icon}</span>
                  <div className="agent-info">
                    <span className="agent-name">{def.name}</span>
                    <span className="agent-desc">{def.description}</span>
                    {def.temperature !== undefined && (
                      <span className="agent-meta">temp {def.temperature}{def.maxTokens ? ` · ${def.maxTokens} tok` : ''}</span>
                    )}
                  </div>
                  <div className="agent-controls">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={def.enabled}
                        onChange={() => onToggleAgent(def.id)}
                      />
                      {def.enabled ? 'On' : 'Off'}
                    </label>
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(def)}>
                      Edit
                    </button>
                    {!BUILT_IN_AGENT_IDS.has(def.id) && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => onRemoveAgent(def.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Add custom agent ─────────────────────────────────────────── */}
        {showAddForm ? (
          <div className="agent-edit-form" style={{ margin: '0 0 8px' }}>
            <h4 style={{ marginBottom: 8 }}>New Agent</h4>
            <div className="form-row" style={{ flexDirection: 'row', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>Icon</label>
                <input
                  className="search-input" style={{ width: 56 }}
                  value={newDraft.icon ?? '🤖'}
                  onChange={(e) => setNewDraft({ ...newDraft, icon: e.target.value })}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label>Name</label>
                <input
                  className="search-input" placeholder="My Agent"
                  value={newDraft.name ?? ''}
                  onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <label>Description</label>
              <input
                className="search-input" placeholder="What does this agent do?"
                value={newDraft.description ?? ''}
                onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>System Prompt</label>
              <textarea
                className="search-input" rows={5}
                style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                placeholder="You are a specialized agent that..."
                value={newDraft.systemPrompt ?? ''}
                onChange={(e) => setNewDraft({ ...newDraft, systemPrompt: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleAddNew}
                disabled={!newDraft.name?.trim() || !newDraft.systemPrompt?.trim()}
              >
                Add Agent
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 16px 16px' }}>
            <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
              + Add Custom Agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
