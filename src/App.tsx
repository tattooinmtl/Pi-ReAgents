import { useState, useEffect, useCallback, useRef } from 'react'
import { Chat } from './components/Chat'
import { DownloadProgressFloat } from './components/DownloadProgressFloat'
import { PersonalityConfigPanel } from './components/PersonalityConfig'
import { SkillsEditor } from './components/SkillsEditor'
import { ModelManagerUI } from './components/ModelManagerUI'
import { MemoryViewer } from './components/MemoryViewer'
import { BottomPanel } from './components/BottomPanel'
import { Console } from './components/Console'
import { FileExplorer } from './components/FileExplorer'
import { CodingSpace } from './components/CodingSpace'
import { Terminal } from './components/Terminal'
import { ProvidersPanel } from './components/ProvidersPanel'
import { AgentsPanel } from './components/AgentsPanel'
import { AgentOrchestrator } from './agents/AgentOrchestrator'
import { NeuralEngine } from './engine/NeuralEngine'
import { SkillsManager } from './skills/SkillsManager'
import { MemoryManager } from './memory/MemoryManager'
import { ModelManager } from './models/ModelManager'
import type { Message, PersonalityConfig, Skill, ModelConfig, MemorySession, BackendStatus, ProviderConfig, AgentDefinition, OrchestrationSession, GenerationStats } from './types'

const LOCAL_PROVIDER: ProviderConfig = { id: 'local', name: 'Local (llama.cpp)', type: 'local' }

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
  const [showProviders, setShowProviders] = useState(false)
  const [showAgents, setShowAgents] = useState(false)
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [activeOrchestration, setActiveOrchestration] = useState<OrchestrationSession | null>(null)
  const [isOrchestrating, setIsOrchestrating] = useState(false)
  const [explorerRoot, setExplorerRoot] = useState('')
  const [openEditingFile, setOpenEditingFile] = useState<{ path: string; name: string } | null>(null)
  const [providers, setProviders] = useState<ProviderConfig[]>([LOCAL_PROVIDER])
  const [activeProvider, setActiveProvider] = useState<ProviderConfig>(LOCAL_PROVIDER)
  // Context notes injected via /btw — appended to system prompt on every send
  const [btwContext, setBtwContext] = useState('')
  const [downloadState, setDownloadState] = useState<{
    filename: string; pct: number; received: number; total: number; bytesPerSec: number
  } | null>(null)
  const [generationStats, setGenerationStats] = useState<GenerationStats | null>(null)
  const dlRateRef = useRef<{ received: number; time: number } | null>(null)
  const dlClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const engineRef = useRef(new NeuralEngine())
  const skillsRef = useRef(new SkillsManager())
  const memoryRef = useRef(new MemoryManager())
  const modelManagerRef = useRef(new ModelManager())
  const orchestratorRef = useRef<AgentOrchestrator | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Always holds the latest menu-action handler so the IPC listener (set up
  // once at mount) never captures stale state via closure.
  // Stable refs so useCallback closures always read the latest value without
  // adding frequently-changing state to their dep arrays.
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Keep agent runners in sync when the user changes personality settings.
  useEffect(() => {
    orchestratorRef.current?.updateBasePersonality(personality)
  }, [personality])


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

      // Initialize the agent orchestrator with the current personality snapshot.
      // A separate useEffect keeps it in sync when personality changes.
      orchestratorRef.current = new AgentOrchestrator(
        engine,
        personality,
        (session) => setActiveOrchestration({ ...session })
      )
      setAgents(orchestratorRef.current.getAgents())

      const logsData = await api.getServerLogs().catch(() => '')
      if (logsData) setLogs((prev) => [...prev, ...logsData.trim().split('\n').filter(Boolean)])

      // Store unsub refs in the outer scope so the effect cleanup can reach them.
      unsubLogs = api.onServerLog((data) => {
        setLogs((prev) => [...prev, ...data.trim().split('\n').filter(Boolean)])
      })
      unsubDl = api.onDownloadProgress?.((data) => {
        const now = Date.now()
        let bytesPerSec = 0
        if (dlRateRef.current && data.received > dlRateRef.current.received) {
          const dt = (now - dlRateRef.current.time) / 1000
          if (dt > 0) bytesPerSec = (data.received - dlRateRef.current.received) / dt
        }
        dlRateRef.current = { received: data.received, time: now }

        if (dlClearRef.current) clearTimeout(dlClearRef.current)

        setDownloadState({
          filename: data.filename,
          pct: data.pct,
          received: data.received,
          total: data.total,
          bytesPerSec,
        })

        // Log only at 0%, every 10%, and 100%
        if (data.pct === 0 || data.pct % 10 === 0 || data.pct === 100) {
          addLog(`Downloading ${data.filename}: ${data.pct}%`)
        }

        if (data.pct >= 100) {
          dlClearRef.current = setTimeout(() => {
            setDownloadState(null)
            dlRateRef.current = null
          }, 2500)
        }
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

    // Build the system prompt string (personality + active skills + file context + btw notes).
    const enabledSkills = skillsManager.getEnabledSkills()
    const skillContext = enabledSkills.length > 0
      ? `\n\nActive Skills:\n${skillsManager.getCombinedSystemPrompt()}`
      : ''
    const fileContext = openEditingFile
      ? `\n\nCurrently editing: ${openEditingFile.name}\nFile path: ${openEditingFile.path}`
      : ''
    const btwBlock = btwContext ? `\n\nContext notes:\n${btwContext}` : ''
    const systemPrompt = `${personality.systemPrompt}${skillContext}${fileContext}${btwBlock}`

    // Use the ref so we always have the current history without making
    // handleSend depend on the frequently-updated messages state.
    const historyForPrompt: Message[] = [...messagesRef.current, userMsg]

    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)
    setGenerationStats(null)

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
        },
        (stats) => setGenerationStats(stats)
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
  }, [personality, activeModel, skillsManager, memoryManager, engine, openEditingFile, btwContext])

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
    addLog(`Loading model: ${filePath}`)
    try {
      const config = await modelManager.addLocalModel(filePath)
      setModels(modelManager.getAllModels())
      setActiveModel(config)
      modelManager.setActiveModel(config.id)
      await engine.startServer(config.path, config.chatTemplate)
      addLog('Server ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load model'
      addLog(`Error: ${msg}`)
    }
  }, [addLog, modelManager, engine])

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
      const msg = err instanceof Error ? err.message : 'Failed to start server'
      addLog(`Error: ${msg}`)
    }
  }, [modelManager, engine, addLog])

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

  // ── Agent orchestration handlers ──────────────────────────────────────────

  const handleToggleAgent = useCallback((id: string) => {
    const orch = orchestratorRef.current
    if (!orch) return
    const agent = orch.getAgents().find((a) => a.id === id)
    if (!agent) return
    orch.updateAgent({ ...agent, enabled: !agent.enabled })
    setAgents(orch.getAgents())
  }, [])

  const handleUpdateAgent = useCallback((def: AgentDefinition) => {
    orchestratorRef.current?.updateAgent(def)
    setAgents(orchestratorRef.current?.getAgents() ?? [])
  }, [])

  const handleAddAgent = useCallback((def: AgentDefinition) => {
    orchestratorRef.current?.registerAgent(def)
    setAgents(orchestratorRef.current?.getAgents() ?? [])
  }, [])

  const handleRemoveAgent = useCallback((id: string) => {
    orchestratorRef.current?.removeAgent(id)
    setAgents(orchestratorRef.current?.getAgents() ?? [])
  }, [])

  const handleStopOrchestration = useCallback(() => {
    orchestratorRef.current?.abort()
    setIsOrchestrating(false)
  }, [])

  const handleRunAgents = useCallback(async (userMessage: string) => {
    const orch = orchestratorRef.current
    if (!orch || isOrchestrating) return

    setIsOrchestrating(true)
    setShowAgents(true)

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
      model: activeModel?.name,
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const session = await orch.run(userMessage)

      if (session.synthesisOutput) {
        const assistantMsg: Message = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: session.synthesisOutput,
          timestamp: Date.now(),
          model: activeModel?.name,
        }
        setMessages((prev) => [...prev, assistantMsg])
        await memoryManager.saveMessage(userMsg)
        await memoryManager.saveMessage(assistantMsg)
        const updated = await memoryManager.listSessions()
        setSessions(updated)
      }
    } catch (err) {
      const errorMsg: Message = {
        id: `msg-${Date.now() + 2}`,
        role: 'system',
        content: `Agent orchestration failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsOrchestrating(false)
    }
  }, [isOrchestrating, activeModel, memoryManager])

  const handleSelectProvider = useCallback((provider: ProviderConfig) => {
    setActiveProvider(provider)
    engine.setProvider(provider)
    addLog(`Provider switched to: ${provider.name}`)
    setShowProviders(false)
  }, [engine, addLog])

  const handleAddProvider = useCallback((provider: ProviderConfig) => {
    setProviders((prev) => [...prev, provider])
    handleSelectProvider(provider)
  }, [handleSelectProvider])

  const handleRemoveProvider = useCallback((id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id))
    if (activeProvider.id === id) {
      setActiveProvider(LOCAL_PROVIDER)
      engine.setProvider(LOCAL_PROVIDER)
    }
  }, [activeProvider, engine])

  const addSystemMsg = useCallback((content: string) => {
    const msg: Message = {
      id: `msg-${Date.now()}`,
      role: 'system',
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  const HELP_TEXT = `Available commands:
/help — Show this help
/providers — Manage AI providers (local, OpenAI, Ollama, custom)
/btw <note> — Add a private context note (injected into system prompt)
/clear — Clear current chat
/new — Start a new session
/models — Open model manager
/skills — Open skills manager
/code — Toggle code assistant mode
/system <prompt> — Change system prompt
/temp <0.1–2.0> — Set temperature
/tokens <number> — Set max tokens
/save — Save current session
/export — Export chat as text file`

  const handleCommand = useCallback(async (cmd: string, args: string) => {
    switch (cmd) {
      case 'help':
        addSystemMsg(HELP_TEXT)
        break

      case 'providers':
        setShowProviders(true)
        break

      case 'btw':
        if (!args) { addSystemMsg('Usage: /btw <your note>'); break }
        setBtwContext((prev) => prev ? `${prev}\n- ${args}` : `- ${args}`)
        setMessages((prev) => [
          ...prev,
          { id: `msg-${Date.now()}`, role: 'system', content: `[BTW] ${args}`, timestamp: Date.now() },
        ])
        break

      case 'clear':
        setMessages([])
        setBtwContext('')
        break

      case 'new':
        setMessages([])
        setBtwContext('')
        memoryManager.resetSession()
        addLog('New session started')
        break

      case 'models':
        setShowModels(true)
        break

      case 'skills':
        setShowSkills(true)
        break

      case 'code':
        handleToggleCodeAssistant()
        break

      case 'system':
        if (!args) { addSystemMsg('Usage: /system <new prompt>'); break }
        setPersonality((prev) => ({ ...prev, systemPrompt: args }))
        addSystemMsg(`System prompt updated.`)
        addLog('System prompt changed via /system command')
        break

      case 'temp': {
        const val = parseFloat(args)
        if (isNaN(val) || val < 0.01 || val > 5) {
          addSystemMsg('Usage: /temp <0.1–2.0>  (e.g. /temp 0.8)')
          break
        }
        setPersonality((prev) => ({ ...prev, temperature: val }))
        addSystemMsg(`Temperature set to ${val}`)
        break
      }

      case 'tokens': {
        const val = parseInt(args, 10)
        if (isNaN(val) || val < 1) {
          addSystemMsg('Usage: /tokens <number>  (e.g. /tokens 1024)')
          break
        }
        setPersonality((prev) => ({ ...prev, maxTokens: val }))
        addSystemMsg(`Max tokens set to ${val}`)
        break
      }

      case 'save': {
        const currentMsgs = messagesRef.current.filter((m) => m.role !== 'system')
        if (currentMsgs.length === 0) { addSystemMsg('Nothing to save yet.'); break }
        try {
          for (const m of currentMsgs) await memoryManager.saveMessage(m)
          const updated = await memoryManager.listSessions()
          setSessions(updated)
          addSystemMsg('Session saved.')
        } catch {
          addSystemMsg('Save failed.')
        }
        break
      }

      case 'agents':
        setShowAgents(true)
        break

      case 'export': {
        const lines = messagesRef.current
          .filter((m) => !m.content.startsWith('[BTW]'))
          .map((m) => {
            const label = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : 'System'
            return `[${label}]\n${m.content}`
          })
          .join('\n\n---\n\n')
        const blob = new Blob([lines], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chat-${new Date().toISOString().slice(0, 10)}.txt`
        a.click()
        URL.revokeObjectURL(url)
        addSystemMsg('Chat exported.')
        break
      }

      default:
        addSystemMsg(`Unknown command: /${cmd}\nType /help to see all commands.`)
    }
  }, [addSystemMsg, addLog, memoryManager, handleToggleCodeAssistant, messagesRef]) // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="app">
      <DownloadProgressFloat download={downloadState} />
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
            isProcessing={isProcessing || isOrchestrating}
            enabledSkills={skillsManager.getEnabledSkills()}
            onSend={handleSend}
            onCommand={handleCommand}
            onRunAgents={handleRunAgents}
            onStop={isOrchestrating ? handleStopOrchestration : handleStop}
            onApplyCode={handleApplyCode}
            onOpenInCodingSpace={handleOpenInCodingSpace}
            generationStats={generationStats}
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

      {showAgents && (
        <AgentsPanel
          agents={agents}
          activeSession={activeOrchestration}
          onToggleAgent={handleToggleAgent}
          onUpdateAgent={handleUpdateAgent}
          onAddAgent={handleAddAgent}
          onRemoveAgent={handleRemoveAgent}
          onClose={() => setShowAgents(false)}
        />
      )}

      {showProviders && (
        <ProvidersPanel
          providers={providers}
          activeProvider={activeProvider}
          onSelectProvider={handleSelectProvider}
          onAddProvider={handleAddProvider}
          onRemoveProvider={handleRemoveProvider}
          onClose={() => setShowProviders(false)}
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

      <BottomPanel
        status={backendStatus}
        activeModelName={activeModel?.name}
        skillsCount={skills.length}
        activeSkillsCount={skills.filter(s => s.enabled).length}
        sessionCount={sessions.length}
        agentsCount={agents.length}
        activeAgentsCount={agents.filter(a => a.enabled).length}
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
        onOpenAgents={() => setShowAgents(true)}
        onLoadModel={handleLoadModel}
        onRestartServer={handleRestartServer}
      />

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
