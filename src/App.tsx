import { useState, useEffect, useCallback, useRef } from 'react'
import { Chat } from './components/Chat'
import { PersonalityConfigPanel } from './components/PersonalityConfig'
import { SkillsEditor } from './components/SkillsEditor'
import { ModelManagerUI } from './components/ModelManagerUI'
import { MemoryViewer } from './components/MemoryViewer'
import { BottomPanel } from './components/BottomPanel'
import { Console } from './components/Console'
import { FileExplorer } from './components/FileExplorer'
import { CodingSpace } from './components/CodingSpace'
import { Terminal } from './components/Terminal'
import { NeuralEngine } from './engine/NeuralEngine'
import { SkillsManager } from './skills/SkillsManager'
import { MemoryManager } from './memory/MemoryManager'
import { ModelManager } from './models/ModelManager'
import type { Message, PersonalityConfig, Skill, ModelConfig, MemorySession, BackendStatus } from './types'

const DEFAULT_PERSONALITY: PersonalityConfig = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  maxTokens: 2048,
  systemPrompt: 'You are a helpful AI assistant.',
  contextLength: 4096,
  mirostat: false,
  mirostatTau: 5.0,
  mirostatEta: 0.1,
}

// Defined outside the component so it is never recreated on render.
const CODE_ASSISTANT_SKILL: Skill = {
  id: 'code-assistant',
  name: 'Code Assistant',
  description: 'Full-stack project scaffolder and coding assistant',
  content: `You are an expert full-stack developer and coding assistant. Follow these rules:

1. PROJECT SCAFFOLDING — When asked to start a new project, ask what type: html, node, php, react, python, or markdown. Then create the full file structure with all needed files.
2. HTML — Always include a linked CSS file (style.css) and a JS file (script.js). Use semantic HTML5 structure.
3. CSS — Create responsive, modern styles. Include reset/base styles. Use CSS variables for theming.
4. NODE.JS — Check package.json dependencies. Run 'npm install' when needed. Use express for servers, proper error handling.
5. PHP — Use modern PHP 8+ practices. Include proper error handling, PDO for databases, prepared statements.
6. PYTHON — Check requirements.txt or pyproject.toml. Suggest 'pip install' commands for missing dependencies.
7. MARKDOWN (.md) — Create project plans, README files, documentation with proper structure.
8. FILE STRUCTURE — When creating a project, output the full folder tree first, then each file in code blocks.
9. Always use markdown code blocks with language tags (html, css, js, php, py, etc.).
10. Provide clear explanations alongside code. Follow best practices, accessibility, and security patterns.`,
  path: '',
  enabled: false,
  tags: ['coding', 'fullstack', 'project-scaffolding', 'built-in'],
  version: '2.0.0',
}

const PERSONALITY_KEYS: (keyof PersonalityConfig)[] = [
  'temperature', 'topP', 'topK', 'repeatPenalty', 'maxTokens',
  'systemPrompt', 'contextLength', 'mirostat', 'mirostatTau', 'mirostatEta',
]

function isValidPersonality(obj: unknown): obj is Partial<PersonalityConfig> {
  if (!obj || typeof obj !== 'object') return false
  const rec = obj as Record<string, unknown>
  for (const key of PERSONALITY_KEYS) {
    if (key in rec) {
      const val = rec[key]
      if (key === 'systemPrompt' && typeof val !== 'string') return false
      if (key === 'mirostat' && typeof val !== 'boolean') return false
      if (
        key !== 'systemPrompt' && key !== 'mirostat' &&
        (typeof val !== 'number' || !isFinite(val as number))
      ) return false
    }
  }
  return true
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [personality, setPersonality] = useState<PersonalityConfig>(DEFAULT_PERSONALITY)
  const [skills, setSkills] = useState<Skill[]>([])
  const [models, setModels] = useState<ModelConfig[]>([])
  const [sessions, setSessions] = useState<MemorySession[]>([])
  const [activeModel, setActiveModel] = useState<ModelConfig | undefined>()
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('unloaded')

  const [logs, setLogs] = useState<string[]>([])
  const [codeAssistant, setCodeAssistant] = useState(false)
  const [codingSpace, setCodingSpace] = useState(false)
  const [showPersonality, setShowPersonality] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showMemory, setShowMemory] = useState(false)
  const [showExplorer, setShowExplorer] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [explorerRoot, setExplorerRoot] = useState('')
  const [openEditingFile, setOpenEditingFile] = useState<{ path: string; name: string } | null>(null)

  const engineRef = useRef(new NeuralEngine())
  const skillsRef = useRef(new SkillsManager())
  const memoryRef = useRef(new MemoryManager())
  const modelManagerRef = useRef(new ModelManager())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stable refs so useCallback closures always read the latest value without
  // adding frequently-changing state to their dep arrays.
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])

  const engine = engineRef.current
  const skillsManager = skillsRef.current
  const memoryManager = memoryRef.current
  const modelManager = modelManagerRef.current

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  useEffect(() => {
    // Wire the engine's internal status transitions directly into React state
    // so the UI never drifts, regardless of which code path triggered the change.
    engine.setStatusHandler(setBackendStatus)

    let unsubLogs: (() => void) | undefined
    let unsubDl: (() => void) | undefined

    const init = async () => {
      const api = window.electronAPI
      if (!api) return

      const appPath = await api.getAppPath()
      const llamaDir = await api.getLlamaDir()
      const skillsDir = `${appPath}\\skills`
      const memoryDir = `${appPath}\\memory`
      let modelsDir = ''
      try { modelsDir = await api.getModelsDir() } catch {}

      skillsManager.setSkillsDir(skillsDir)
      memoryManager.setBaseDir(memoryDir)
      if (modelsDir) modelManager.setBaseDir(modelsDir)
      try { await api.createDirectory(await api.getWorkspaceDir()) } catch {}

      try {
        await memoryManager.initialize()
        const allSessions = await memoryManager.listSessions()
        setSessions(allSessions)
      } catch { /* first run */ }

      try {
        const saved = await api.readFile(`${appPath}\\personality.json`)
        const parsed = JSON.parse(saved)
        if (isValidPersonality(parsed) && parsed.systemPrompt) {
          setPersonality((prev) => ({ ...prev, ...parsed }))
          addLog('Personality loaded from save')
        }
      } catch {
        const ls = localStorage.getItem('llama-personality')
        if (ls) {
          try {
            const parsed = JSON.parse(ls)
            if (isValidPersonality(parsed)) {
              setPersonality((prev) => ({ ...prev, ...parsed }))
            }
          } catch {}
        }
      }

      await modelManager.scanLlamaFolder(llamaDir)
      if (modelsDir) {
        const found = await modelManager.scanLlamaFolder(modelsDir)
        if (found.length > 0) addLog(`Found ${found.length} model(s) in models folder`)
      }
      setModels(modelManager.getAllModels())

      engine.setProgressHandler((progress) => {
        addLog(`[engine] ${progress.stage} ${progress.progress}%`)
      })

      const logsData = await api.getServerLogs().catch(() => '')
      if (logsData) setLogs((prev) => [...prev, ...logsData.trim().split('\n').filter(Boolean)])

      // Store unsub refs in the outer scope so the effect cleanup can reach them.
      unsubLogs = api.onServerLog((data) => {
        setLogs((prev) => [...prev, ...data.trim().split('\n').filter(Boolean)])
      })
      unsubDl = api.onDownloadProgress?.((data) => {
        addLog(`Downloading ${data.filename}: ${data.pct}%`)
      })
    }

    init()

    return () => {
      unsubLogs?.()
      unsubDl?.()
      engine.stopServer()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      model: activeModel?.name,
    }

    // Build the system prompt string (personality + active skills + file context).
    const enabledSkills = skillsManager.getEnabledSkills()
    const skillContext = enabledSkills.length > 0
      ? `\n\nActive Skills:\n${skillsManager.getCombinedSystemPrompt()}`
      : ''
    const fileContext = openEditingFile
      ? `\n\nCurrently editing: ${openEditingFile.name}\nFile path: ${openEditingFile.path}`
      : ''
    const systemPrompt = `${personality.systemPrompt}${skillContext}${fileContext}`

    // Use the ref so we always have the current history without making
    // handleSend depend on the frequently-updated messages state.
    const historyForPrompt: Message[] = [...messagesRef.current, userMsg]

    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)

    const assistantMsg: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      model: activeModel?.name,
    }
    setMessages((prev) => [...prev, assistantMsg])

    try {
      let fullResponse = ''

      const response = await engine.generate(
        historyForPrompt,
        systemPrompt,
        personality,
        (token) => {
          fullResponse += token
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: fullResponse }
            }
            return updated
          })
        }
      )

      // Save using the same ID that is displayed in the UI.
      const finalAssistantMsg: Message = { ...assistantMsg, content: response }
      await memoryManager.saveMessage(userMsg)
      await memoryManager.saveMessage(finalAssistantMsg)
      const updated = await memoryManager.listSessions()
      setSessions(updated)
    } catch (err) {
      const errorMsg: Message = {
        id: `msg-${Date.now() + 2}`,
        role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Generation failed'}`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsProcessing(false)
    }
  }, [personality, activeModel, skillsManager, memoryManager, engine, openEditingFile])

  const handleStop = useCallback(() => {
    engine.stopGeneration()
    setIsProcessing(false)
  }, [engine])

  const handleLoadSkillsDirectory = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const dir = await api.openDirectoryDialog()
    if (!dir) return

    try {
      await skillsManager.loadFromDirectory(dir)
      setSkills(skillsManager.getAllSkills())
    } catch (err) {
      console.error('Failed to load skills:', err)
    }
  }, [skillsManager])

  const handleLoadSkillsFile = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const file = await api.openFileDialog([{ name: 'Markdown', extensions: ['md'] }])
    if (!file) return

    try {
      await skillsManager.loadSingleFile(file)
      setSkills(skillsManager.getAllSkills())
    } catch (err) {
      console.error('Failed to load skill:', err)
    }
  }, [skillsManager])

  const handleOpenFiles = useCallback(async () => {
    const api = window.electronAPI
    if (api) {
      let dir: string | null = explorerRoot
      if (!dir) {
        try {
          dir = await api.getWorkspaceDir()
          await api.createDirectory(dir).catch(() => {})
        } catch {
          dir = await api.selectDirectory()
        }
      }
      if (dir) {
        setExplorerRoot(dir)
        setShowExplorer(true)
      }
    } else {
      setExplorerRoot('/')
      setShowExplorer(true)
    }
  }, [explorerRoot])

  const handleToggleCodingSpace = useCallback(async () => {
    if (!codingSpace) {
      const api = window.electronAPI
      if (api) {
        try {
          const dir = explorerRoot || await api.getWorkspaceDir()
          await api.createDirectory(dir).catch(() => {})
          if (!explorerRoot) setExplorerRoot(dir)
          setCodingSpace(true)
          return
        } catch {}
      }
      setCodingSpace(true)
    } else {
      setCodingSpace(false)
    }
  }, [codingSpace, explorerRoot])

  const handleToggleCodeAssistant = useCallback(async () => {
    const next = !codeAssistant
    setCodeAssistant(next)
    if (!next) {
      skillsManager.removeSkill('code-assistant')
      setSkills(skillsManager.getAllSkills())
      addLog('Code Assistant mode OFF')
      return
    }
    skillsManager.addSkill(CODE_ASSISTANT_SKILL)
    setSkills(skillsManager.getAllSkills())
    addLog('Code Assistant mode ON')
    const api = window.electronAPI
    if (api) {
      try {
        const dir = await api.getWorkspaceDir()
        await api.createDirectory(dir).catch(() => {})
        setExplorerRoot(dir)
        setCodingSpace(true)
        addLog('Workspace opened in Coding Space')
      } catch { setCodingSpace(true) }
    } else {
      setCodingSpace(true)
    }
  }, [codeAssistant, skillsManager, addLog])

  const handleToggleSkill = useCallback((id: string) => {
    skillsManager.toggleSkill(id)
    setSkills(skillsManager.getAllSkills())
  }, [skillsManager])

  const handleRemoveSkill = useCallback((id: string) => {
    skillsManager.removeSkill(id)
    setSkills(skillsManager.getAllSkills())
  }, [skillsManager])

  const registerModel = useCallback(async (filePath: string) => {
    addLog(`Selected model: ${filePath}`)
    try {
      const config = await modelManager.addLocalModel(filePath)
      setModels(modelManager.getAllModels())
      setActiveModel(config)
      modelManager.setActiveModel(config.id)
      addLog('Model registered. Click "Restart Server" to start.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register model'
      addLog(`Error: ${msg}`)
    }
  }, [addLog, modelManager])

  const handleLoadModel = useCallback(async () => {
    const api = window.electronAPI
    if (api) {
      const filePath = await api.openFileDialog([{ name: 'GGUF Model', extensions: ['gguf', 'ggml'] }])
      if (!filePath) return
      await registerModel(filePath)
    } else {
      fileInputRef.current?.click()
    }
  }, [registerModel])

  const handleRestartServer = useCallback(async () => {
    const active = modelManager.getActiveModel()
    if (!active) {
      addLog('No model selected — pick one first')
      return
    }
    addLog(`Restarting server with: ${active.name}`)
    try {
      await engine.startServer(active.path, active.chatTemplate)
      addLog('Server ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restart failed'
      addLog(`Error: ${msg}`)
    }
  }, [modelManager, engine, addLog])

  const handleSavePersonality = useCallback(async () => {
    const api = window.electronAPI
    if (!api) {
      localStorage.setItem('llama-personality', JSON.stringify(personality))
      addLog('Personality saved to localStorage')
      return
    }
    try {
      const appPath = await api.getAppPath()
      await api.writeFile(`${appPath}\\personality.json`, JSON.stringify(personality, null, 2))
      addLog('Personality saved')
    } catch {
      addLog('Failed to save personality')
    }
  }, [personality, addLog])

  const handleClearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const LANG_EXT: Record<string, string> = {
    html: 'html', htm: 'html', svg: 'svg', js: 'js', javascript: 'js',
    ts: 'ts', typescript: 'ts', jsx: 'jsx', tsx: 'tsx',
    css: 'css', py: 'py', json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yml',
    md: 'md', sql: 'sql', sh: 'sh', bash: 'sh', bat: 'bat',
  }

  const handleOpenInCodingSpace = useCallback(async (code: string, lang: string) => {
    const api = window.electronAPI
    if (!api) return
    const ext = LANG_EXT[lang] || 'txt'
    try {
      if (!codingSpace) {
        const dir = await api.getWorkspaceDir().catch(() => '')
        if (dir) {
          setExplorerRoot(dir)
          setCodingSpace(true)
        }
      }
      const root = explorerRoot || await api.getWorkspaceDir().catch(() => '')
      if (!root) return
      const name = `ai-gen-${Date.now()}.${ext}`
      const fullPath = `${root}\\${name}`
      await api.createFile(fullPath, code)
      setOpenEditingFile({ path: fullPath, name })
      addLog(`Opened ${name} in coding space`)
    } catch (err) {
      addLog(`Failed: ${err instanceof Error ? err.message : 'error'}`)
    }
  }, [codingSpace, explorerRoot, addLog])

  const handleApplyCode = useCallback(async (code: string, _lang: string) => {
    if (!openEditingFile) {
      addLog('No file open — open a file in the editor first')
      return
    }
    const api = window.electronAPI
    if (!api) {
      addLog('Cannot write file without Electron API')
      return
    }
    try {
      await api.writeFile(openEditingFile.path, code)
      addLog(`Written to ${openEditingFile.name}`)
    } catch (err) {
      addLog(`Failed to write: ${err instanceof Error ? err.message : 'error'}`)
    }
  }, [openEditingFile, addLog])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const path = (file as any).path || file.name
    await registerModel(path)
    e.target.value = ''
  }, [registerModel])

  const handleSelectModel = useCallback(async (id: string) => {
    const config = modelManager.setActiveModel(id)
    if (!config) return

    setActiveModel(config)

    try {
      await engine.startServer(config.path, config.chatTemplate)
      setShowModels(false)
    } catch (err) {
      console.error('Failed to start server:', err)
    }
  }, [modelManager, engine])

  const handleDownloadHF = useCallback(async (repoId: string, filename: string) => {
    // Show loading during the download itself — the engine's status handler takes
    // over once startServer is called inside handleSelectModel.
    setBackendStatus('loading')
    addLog(`Downloading ${filename} from ${repoId}...`)
    try {
      const config = await modelManager.downloadHuggingFaceModel(repoId, filename)
      setModels(modelManager.getAllModels())
      addLog('Download complete, starting server...')
      await handleSelectModel(config.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      addLog(`Download error: ${msg}`)
      setBackendStatus('error')
    }
  }, [modelManager, handleSelectModel, addLog])

  const handleRemoveModel = useCallback((id: string) => {
    const wasActive = activeModel?.id === id
    modelManager.removeModel(id)
    setModels(modelManager.getAllModels())
    if (wasActive) {
      setActiveModel(undefined)
      engine.stopServer()
    }
  }, [modelManager, activeModel, engine])

  const handleLoadSession = useCallback(async (id: string) => {
    try {
      const sessionMessages = await memoryManager.loadSession(id)
      setMessages(sessionMessages)
      setShowMemory(false)
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }, [memoryManager])

  const handleDeleteSession = useCallback(async (id: string) => {
    await memoryManager.deleteSession(id)
    const updated = await memoryManager.listSessions()
    setSessions(updated)
  }, [memoryManager])

  const handleNewSession = useCallback(() => {
    setMessages([])
    memoryManager.resetSession()
  }, [memoryManager])

  return (
    <div className="app">
      {showConsole && (
        <Console logs={logs} onClear={handleClearLogs} onClose={() => setShowConsole(false)} />
      )}
      {showTerminal && (
        <Terminal onClose={() => setShowTerminal(false)} />
      )}
      <div className={`app-main ${codingSpace ? 'app-main-split' : ''}`}>
        <div className={codingSpace ? 'chat-panel' : 'chat-panel-full'}>
          <Chat
            messages={messages}
            isProcessing={isProcessing}
            enabledSkills={skillsManager.getEnabledSkills()}
            onSend={handleSend}
            onStop={handleStop}
            onApplyCode={handleApplyCode}
            onOpenInCodingSpace={handleOpenInCodingSpace}
          />
        </div>
        {codingSpace && explorerRoot && (
          <CodingSpace
            rootDir={explorerRoot}
            editingFile={openEditingFile}
            onFileOpen={(f) => setOpenEditingFile(f)}
          />
        )}
      </div>

      <BottomPanel
        status={backendStatus}
        activeModelName={activeModel?.name}
        skillsCount={skills.length}
        activeSkillsCount={skills.filter(s => s.enabled).length}
        sessionCount={sessions.length}
        codeAssistant={codeAssistant}
        codingSpace={codingSpace}
        onToggleCodeAssistant={handleToggleCodeAssistant}
        onToggleCodingSpace={handleToggleCodingSpace}
        onOpenConsole={() => setShowConsole(true)}
        onOpenTerminal={() => setShowTerminal(true)}
        onOpenFiles={handleOpenFiles}
        onOpenPersonality={() => setShowPersonality(true)}
        onOpenSkills={() => setShowSkills(true)}
        onOpenModels={() => setShowModels(true)}
        onOpenMemory={() => setShowMemory(true)}
        onLoadModel={handleLoadModel}
        onRestartServer={handleRestartServer}
      />

      {showPersonality && (
        <div className="modal-overlay" onClick={() => setShowPersonality(false)}>
          <div className="modal-content panel-personality" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Personality Settings</h2>
              <button className="btn btn-close" onClick={() => setShowPersonality(false)}>×</button>
            </div>
            <PersonalityConfigPanel config={personality} onChange={setPersonality} onSave={handleSavePersonality} />
          </div>
        </div>
      )}

      {showSkills && (
        <SkillsEditor
          skills={skills}
          onLoadDirectory={handleLoadSkillsDirectory}
          onLoadFile={handleLoadSkillsFile}
          onToggle={handleToggleSkill}
          onRemove={handleRemoveSkill}
          onClose={() => setShowSkills(false)}
        />
      )}

      {showModels && (
        <ModelManagerUI
          models={models}
          activeModel={activeModel}
          onSelectModel={handleSelectModel}
          onDownloadHF={handleDownloadHF}
          onRemoveModel={handleRemoveModel}
          onClose={() => setShowModels(false)}
        />
      )}

      {showMemory && (
        <MemoryViewer
          sessions={sessions}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onNewSession={handleNewSession}
          onClose={() => setShowMemory(false)}
        />
      )}

      {showExplorer && explorerRoot && (
        <FileExplorer
          rootDir={explorerRoot}
          onClose={() => { setShowExplorer(false); setOpenEditingFile(null) }}
          onFileOpen={(f) => setOpenEditingFile(f)}
          floating
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".gguf,.ggml"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  )
}
