import type { Skill } from '../types'

export class SkillsManager {
  private skills: Map<string, Skill> = new Map()
  private skillsDir: string = ''

  constructor(skillsDir?: string) {
    if (skillsDir) {
      this.skillsDir = skillsDir
    }
  }

  setSkillsDir(dir: string) {
    this.skillsDir = dir
  }

  async loadFromDirectory(dirPath?: string): Promise<Skill[]> {
    const targetDir = dirPath || this.skillsDir
    if (!targetDir) throw new Error('No skills directory specified')

    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    const files = await api.readDirectory(targetDir)
    const mdFiles = files.filter((f: string) => f.endsWith('.md'))

    const loaded: Skill[] = []
    for (const file of mdFiles) {
      const fullPath = `${targetDir}\\${file}`
      try {
        const content = await api.readFile(fullPath)
        const skill = this.parseSkillFile(content, fullPath)
        if (skill) {
          this.skills.set(skill.id, skill)
          loaded.push(skill)
        } else {
          console.warn(`[SkillsManager] Skipped empty skill file: ${file}`)
        }
      } catch {
        continue
      }
    }

    return loaded
  }

  async loadSingleFile(filePath: string): Promise<Skill> {
    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    const content = await api.readFile(filePath)
    const skill = this.parseSkillFile(content, filePath)
    if (!skill) throw new Error(`Skill file has no body content: ${filePath}`)

    this.skills.set(skill.id, skill)
    return skill
  }

  async saveSkill(skill: Skill): Promise<void> {
    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    const content = this.serializeSkill(skill)
    await api.writeFile(skill.path, content)
    this.skills.set(skill.id, skill)
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  getEnabledSkills(): Skill[] {
    return this.getAllSkills().filter((s) => s.enabled)
  }

  toggleSkill(id: string): Skill | undefined {
    const skill = this.skills.get(id)
    if (skill) {
      skill.enabled = !skill.enabled
      this.skills.set(id, skill)
    }
    return skill
  }

  addSkill(skill: Skill): void {
    this.skills.set(skill.id, { ...skill, enabled: true })
  }

  removeSkill(id: string): boolean {
    return this.skills.delete(id)
  }

  getCombinedSystemPrompt(): string {
    return this.getEnabledSkills()
      .map((s) => `## ${s.name}\n\n${s.content}`)
      .join('\n\n')
  }

  clear() {
    this.skills.clear()
  }

  private parseSkillFile(content: string, filePath: string): Skill | null {
    const lines = content.split('\n')
    const metadata: Record<string, string> = {}
    let contentStart = 0

    if (lines[0]?.trim() === '---') {
      let i = 1
      while (i < lines.length && lines[i]?.trim() !== '---') {
        const colonIdx = lines[i].indexOf(':')
        if (colonIdx > 0) {
          const key = lines[i].slice(0, colonIdx).trim().toLowerCase()
          const value = lines[i].slice(colonIdx + 1).trim()
          metadata[key] = value
        }
        i++
      }
      contentStart = i + 1
    }

    const name = metadata.name || this.filenameToName(filePath)
    const id = metadata.id || this.pathToId(filePath)
    const description = metadata.description || ''
    const tags = metadata.tags ? metadata.tags.split(',').map((t: string) => t.trim()) : []
    const version = metadata.version || '1.0.0'
    const body = lines.slice(contentStart).join('\n').trim()

    if (!body) return null

    return {
      id,
      name,
      description,
      content: body,
      path: filePath,
      enabled: true,
      tags,
      version,
    }
  }

  private serializeSkill(skill: Skill): string {
    const frontMatter = [
      '---',
      `id: ${skill.id}`,
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      `version: ${skill.version}`,
      `tags: ${skill.tags.join(', ')}`,
      '---',
      '',
    ].join('\n')

    return frontMatter + skill.content
  }

  private filenameToName(filePath: string): string {
    const name = filePath.split('\\').pop()?.replace('.md', '') || 'Unnamed'
    return name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  private pathToId(filePath: string): string {
    const name = filePath.split('\\').pop()?.replace('.md', '') || 'unknown'
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  }
}
