import type { PersonalityConfig } from '../types'

interface PersonalityConfigProps {
  config: PersonalityConfig
  onChange: (config: PersonalityConfig) => void
  onSave: () => void
}

export function PersonalityConfigPanel({ config, onChange, onSave }: PersonalityConfigProps) {
  const update = (partial: Partial<PersonalityConfig>) => {
    onChange({ ...config, ...partial })
  }

  return (
    <div className="personality-config">
      <h3>Personality Settings</h3>

      <div className="config-group">
        <label>
          <span>System Prompt</span>
          <textarea
            value={config.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            rows={4}
            placeholder="You are a helpful AI assistant..."
          />
        </label>
      </div>

      <div className="config-grid">
        <div className="config-group">
          <label>
            <span>Temperature: {config.temperature.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={config.temperature}
              onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
            />
          </label>
        </div>

        <div className="config-group">
          <label>
            <span>Top P: {config.topP.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.topP}
              onChange={(e) => update({ topP: parseFloat(e.target.value) })}
            />
          </label>
        </div>

        <div className="config-group">
          <label>
            <span>Top K: {config.topK}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={config.topK}
              onChange={(e) => update({ topK: parseInt(e.target.value) })}
            />
          </label>
        </div>

        <div className="config-group">
          <label>
            <span>Repeat Penalty: {config.repeatPenalty.toFixed(2)}</span>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={config.repeatPenalty}
              onChange={(e) => update({ repeatPenalty: parseFloat(e.target.value) })}
            />
          </label>
        </div>

        <div className="config-group">
          <label>
            <span>Max Tokens: {config.maxTokens}</span>
            <input
              type="range"
              min="64"
              max="8192"
              step="64"
              value={config.maxTokens}
              onChange={(e) => update({ maxTokens: parseInt(e.target.value) })}
            />
          </label>
        </div>

        <div className="config-group">
          <label>
            <span>Context Length: {config.contextLength}</span>
            <input
              type="range"
              min="512"
              max="32768"
              step="512"
              value={config.contextLength}
              onChange={(e) => update({ contextLength: parseInt(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="config-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={config.mirostat}
            onChange={(e) => update({ mirostat: e.target.checked })}
          />
          <span>Mirostat Sampling</span>
        </label>
      </div>

      {config.mirostat && (
        <div className="config-grid">
          <div className="config-group">
            <label>
              <span>Mirostat Tau: {config.mirostatTau.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={config.mirostatTau}
                onChange={(e) => update({ mirostatTau: parseFloat(e.target.value) })}
              />
            </label>
          </div>
          <div className="config-group">
            <label>
              <span>Mirostat Eta: {config.mirostatEta.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.mirostatEta}
                onChange={(e) => update({ mirostatEta: parseFloat(e.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      <div className="config-save-row">
        <button className="btn btn-primary" onClick={onSave}>Save Personality</button>
      </div>
    </div>
  )
}
