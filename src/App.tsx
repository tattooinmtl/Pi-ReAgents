import { useState, useEffect, useCallback, useRef } from 'react'
import { Chat } from './components/Chat'
import { PersonalityConfigPanel } from './components/PersonalityConfig'
import { SkillsEditor } from './components/SkillsEditor'
import { ModelManagerUI } from './components/ModelManagerUI'
import { MemoryViewer } from './components/MemoryViewer'
import { BottomPanel } from './components/BottomPanel'
import { Console } from './components/Console'
import { CodePreview } from './components/CodePreview'
import { FileExplorer } from './components/FileExplorer'
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
  const [preview, setPreview] = useState<{ code: string; lang: string } | null>(null)
  const [showPersonality, setShowPersonality] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showMemory, setShowMemory] = useState(false)
  const [showExplorer, setShowExplorer] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [explorerRoot, setExplorerRoot] = useState('')
  const [openEditingFile, setOpenEditingFile] = useState<{ path: string; name: string } | null>(null)

  const engineRef = useRef(new NeuralEngine())
  const skillsRef = useRef(new SkillsManager())
  const memoryRef = useRef(new MemoryManager())
  const modelManagerRef = useRef(new ModelManager())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const engine = engineRef.current
  const skillsManager = skillsRef.current
  const memoryManager = memoryRef.current
  const modelManager = modelManagerRef.current

  useEffect(() => {
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
        if (parsed.systemPrompt) setPersonality((prev) => ({ ...prev, ...parsed }))
        addLog('Personality loaded from save')
      } catch {
        const ls = localStorage.getItem('llama-personality')
        if (ls) {
          try { setPersonality((prev) => ({ ...prev, ...JSON.parse(ls) })) } catch {}
        }
      }

      await modelManager.scanLlamaFolder(llamaDir)
      if (modelsDir) {
        const found = await modelManager.scanLlamaFolder(modelsDir)
        if (found.length > 0) addLog(`Found ${found.length} model(s) in models folder`)
      }
      setModels(modelManager.getAllModels())

      engine.setProgressHandler((progress) => {
        if (progress.stage === 'ready') setBackendStatus('ready')
        addLog(`[engine] ${progress.stage} ${progress.progress}%`)
      })

      const logsData = await api.getServerLogs().catch(() => '')
      if (logsData) setLogs((prev) => [...prev, ...logsData.trim().split('\n').filter(Boolean)])

      const unsubLogs = api.onServerLog((data) => {
        setLogs((prev) => [...prev, ...data.trim().split('\n').filter(Boolean)])
      })
      const unsubDl = api.onDownloadProgress?.((data) => {
        addLog(`Downloading ${data.filename}: ${data.pct}%`)
      })
      return () => { unsubLogs?.(); unsubDl?.() }
    }
    init()

    return () => { engine.stopServer() }
  }, [])

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  useEffect(() => {
    setBackendStatus(engine.getStatus())
  }, [activeModel])

  const handleSend = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      model: activeModel?.name,
    }

    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)

    try {
      const enabledSkills = skillsManager.getEnabledSkills()
      const skillContext = enabledSkills.length > 0
        ? `\n\nActive Skills:\n${skillsManager.getCombinedSystemPrompt()}`
        : ''

      const fileContext = openEditingFile
        ? `\n\nCurrently editing: ${openEditingFile.name}\nFile path: ${openEditingFile.path}`
        : ''
      const fullPrompt = `${personality.systemPrompt}${skillContext}${fileContext}\n\nUser: ${content}`
      let fullResponse = ''

      const assistantMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        model: activeModel?.name,
      }
      setMessages((prev) => [...prev, assistantMsg])

      const response = await engine.generate(
        fullPrompt,
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

      const finalMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
        model: activeModel?.name,
      }

      await memoryManager.saveMessage(userMsg)
      await memoryManager.saveMessage(finalMsg)
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

  const CODE_ASSISTANT_SKILL: Skill = {
    id: 'code-assistant',
    name: 'Code Assistant',
    description: 'Built-in coding assistant mode',
    content: 'You are an expert coding assistant. When providing code, always use markdown code blocks with the appropriate language tag. Provide clear, well-commented code. Explain your reasoning before writing code. Follow best practices and design patterns.',
    path: '',
    enabled: false,
    tags: ['coding', 'built-in'],
    version: '1.0.0',
  }

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

  const handleToggleCodeAssistant = useCallback(() => {
    const next = !codeAssistant
    setCodeAssistant(next)
    if (next) {
      skillsManager.addSkill(CODE_ASSISTANT_SKILL)
      setSkills(skillsManager.getAllSkills())
      addLog('Code Assistant mode ON')
    } else {
      skillsManager.removeSkill('code-assistant')
      setSkills(skillsManager.getAllSkills())
      addLog('Code Assistant mode OFF')
    }
  }, [codeAssistant, skillsManager])

  const handleToggleSkill = useCallback((id: string) => {
    skillsManager.toggleSkill(id)
    setSkills(skillsManager.getAllSkills())
  }, [skillsManager])

  const handleRemoveSkill = useCallback((id: string) => {
    skillsManager.removeSkill(id)
    setSkills(skillsManager.getAllSkills())
  }, [skillsManager])

  const handleLoadModel = useCallback(async () => {
    const api = window.electronAPI
    if (api) {
      const filePath = await api.openFileDialog([{ name: 'GGUF Model', extensions: ['gguf', 'ggml'] }])
      if (!filePath) return
      await registerModel(filePath)
    } else {
      fileInputRef.current?.click()
    }
  }, [modelManager, engine])

  const handleRestartServer = useCallback(async () => {
    const active = modelManager.getActiveModel()
    if (!active) {
      addLog('No model selected — pick one first')
      return
    }
    addLog(`Restarting server with: ${active.name}`)
    setBackendStatus('loading')
    try {
      await engine.startServer(active.path)
      setBackendStatus('ready')
      addLog('Server ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restart failed'
      addLog(`Error: ${msg}`)
    }
  }, [modelManager, engine])

  const registerModel = async (filePath: string) => {
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
  }

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
  }, [personality])

  const handleClearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const handlePreview = useCallback((data: { code: string; lang: string }) => {
    setPreview(data)
  }, [])

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
  }, [openEditingFile])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const path = (file as any).path || file.name
    await registerModel(path)
    e.target.value = ''
  }, [modelManager, engine])

  const handleSelectModel = useCallback(async (id: string) => {
    const config = modelManager.setActiveModel(id)
    if (!config) return

    setActiveModel(config)
    setBackendStatus('loading')

    try {
      await engine.startServer(config.path)
      setBackendStatus('ready')
      setShowModels(false)
    } catch (err) {
      console.error('Failed to start server:', err)
      setBackendStatus('error')
    }
  }, [modelManager, engine])

  const handleDownloadHF = useCallback(async (repoId: string, filename: string) => {
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
  }, [modelManager, handleSelectModel])

  const handleRemoveModel = useCallback((id: string) => {
    const wasActive = activeModel?.id === id
    modelManager.removeModel(id)
    setModels(modelManager.getAllModels())
    if (wasActive) {
      setActiveModel(undefined)
      engine.stopServer()
      setBackendStatus('unloaded')
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

  const handleNewSession = useCallback(async () => {
    setMessages([])
  }, [])

  return (
    <div className="app">
      <Console logs={logs} onClear={handleClearLogs} />
      <div className="app-main">
        <Chat
          messages={messages}
          isProcessing={isProcessing}
          personality={personality}
          enabledSkills={skillsManager.getEnabledSkills()}
          onSend={handleSend}
          onStop={handleStop}
          onPreview={handlePreview}
          onApplyCode={handleApplyCode}
        />
      </div>

      <BottomPanel
        status={backendStatus}
        activeModelName={activeModel?.name}
        skillsCount={skills.length}
        activeSkillsCount={skills.filter(s => s.enabled).length}
        sessionCount={sessions.length}
        codeAssistant={codeAssistant}
        onToggleCodeAssistant={handleToggleCodeAssistant}
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
          modelManager={modelManager}
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

      {preview && (
        <CodePreview
          code={preview.code}
          lang={preview.lang}
          onClose={() => setPreview(null)}
        />
      )}

      {showExplorer && explorerRoot && (
        <FileExplorer
          rootDir={explorerRoot}
          onClose={() => { setShowExplorer(false); setOpenEditingFile(null) }}
          onFileOpen={(f) => setOpenEditingFile(f)}
        />
      )}

      {showTerminal && (
        <Terminal onClose={() => setShowTerminal(false)} />
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
