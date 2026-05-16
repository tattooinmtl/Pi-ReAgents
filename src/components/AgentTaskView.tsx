import type { AgentDefinition, AgentResult } from '../types'

interface AgentTaskViewProps {
  result: AgentResult
  definition: AgentDefinition | undefined
}

const STATUS_COLOR: Record<string, string> = {
  idle:    'var(--text-muted)',
  queued:  'var(--text-secondary)',
  running: 'var(--accent)',
  done:    'var(--success)',
  error:   'var(--danger)',
  skipped: 'var(--text-muted)',
}

const STATUS_LABEL: Record<string, string> = {
  idle:    'Idle',
  queued:  'Queued',
  running: 'Running…',
  done:    'Done',
  error:   'Error',
  skipped: 'Skipped',
}

export function AgentTaskView({ result, definition }: AgentTaskViewProps) {
  const elapsed = result.finishedAt && result.startedAt
    ? `${((result.finishedAt - result.startedAt) / 1000).toFixed(1)}s`
    : result.status === 'running' ? '…' : ''

  const displayText = result.partialOutput || result.output

  return (
    <div className="agent-task-view">
      <div className="agent-task-header">
        <span className="agent-task-icon">{definition?.icon ?? '🤖'}</span>
        <span className="agent-task-name">{result.agentName}</span>
        <span
          className="agent-task-status"
          style={{ color: STATUS_COLOR[result.status] ?? 'inherit' }}
        >
          {STATUS_LABEL[result.status] ?? result.status}
        </span>
        {elapsed && <span className="agent-task-elapsed">{elapsed}</span>}
      </div>

      {result.status === 'error' && result.error && (
        <div className="agent-task-error">{result.error}</div>
      )}

      {displayText ? (
        <div className="agent-task-output">
          {result.status === 'running' && (
            <div className="typing-indicator" style={{ marginBottom: 6 }}>
              <span /><span /><span />
            </div>
          )}
          <pre className="agent-task-text">{displayText}</pre>
        </div>
      ) : result.status === 'queued' ? (
        <div className="agent-task-queued-hint">Waiting for previous agents to finish…</div>
      ) : null}
    </div>
  )
}
