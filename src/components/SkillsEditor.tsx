import { useState } from 'react'
import type { Skill } from '../types'

interface SkillsEditorProps {
  skills: Skill[]
  onLoadDirectory: () => void
  onLoadFile: () => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function SkillsEditor({ skills, onLoadDirectory, onLoadFile, onToggle, onRemove, onClose }: SkillsEditorProps) {
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [filter, setFilter] = useState('')

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content skills-editor" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Skills Manager</h2>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>

        <div className="skills-toolbar">
          <input
            type="text"
            placeholder="Search skills..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
          <button className="btn btn-primary" onClick={onLoadDirectory}>
            Load Directory
          </button>
          <button className="btn btn-secondary" onClick={onLoadFile}>
            Open Skill File
          </button>
        </div>

        <div className="skills-content">
          <div className="skills-list">
            {filtered.length === 0 && (
              <div className="empty-state">
                <p>No skills loaded. Load a directory or file to get started.</p>
              </div>
            )}
            {filtered.map((skill) => (
              <div
                key={skill.id}
                className={`skill-item ${selectedSkill?.id === skill.id ? 'selected' : ''}`}
                onClick={() => setSelectedSkill(skill)}
              >
                <div className="skill-item-header">
                  <span className={`skill-toggle ${skill.enabled ? 'enabled' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggle(skill.id) }}
                  >
                    {skill.enabled ? '●' : '○'}
                  </span>
                  <span className="skill-name">{skill.name}</span>
                  <span className="skill-version">v{skill.version}</span>
                </div>
                <p className="skill-description">{skill.description}</p>
                <div className="skill-tags">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedSkill && (
            <div className="skill-preview">
              <div className="skill-preview-header">
                <h3>{selectedSkill.name}</h3>
                <button className="btn btn-danger" onClick={() => { onRemove(selectedSkill.id); setSelectedSkill(null) }}>
                  Remove
                </button>
              </div>
              <pre className="skill-content-preview">{selectedSkill.content}</pre>
            </div>
          )}
        </div>

        <div className="skills-status">
          {skills.length > 0 && (
            <span>{skills.filter((s) => s.enabled).length} / {skills.length} skills active</span>
          )}
        </div>
      </div>
    </div>
  )
}
