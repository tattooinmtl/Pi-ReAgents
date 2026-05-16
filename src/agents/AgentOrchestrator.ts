import type { NeuralEngine } from '../engine/NeuralEngine'
import { AgentRunner } from './AgentRunner'
import { BUILT_IN_AGENTS } from './agentTemplates'
import type {
  AgentDefinition,
  AgentResult,
  AgentTask,
  OrchestrationSession,
  PersonalityConfig,
  Message,
} from '../types'

interface DecompositionResult {
  tasks: Array<{
    agentId: string
    taskDescription: string
    priority: number
  }>
  reasoning: string
}

export class AgentOrchestrator {
  private engine: NeuralEngine
  private agents: Map<string, AgentDefinition>
  private runners: Map<string, AgentRunner>
  private basePersonality: PersonalityConfig
  private onSessionUpdate: (session: OrchestrationSession) => void

  constructor(
    engine: NeuralEngine,
    basePersonality: PersonalityConfig,
    onSessionUpdate: (session: OrchestrationSession) => void
  ) {
    this.engine = engine
    this.basePersonality = basePersonality
    this.onSessionUpdate = onSessionUpdate
    this.agents = new Map()
    this.runners = new Map()

    for (const def of BUILT_IN_AGENTS) {
      this.registerAgent(def)
    }
  }

  // ── Agent Registry ──────────────────────────────────────────────────────────

  registerAgent(def: AgentDefinition): void {
    this.agents.set(def.id, def)
    this.runners.set(def.id, new AgentRunner(def, this.engine, this.basePersonality))
  }

  removeAgent(id: string): void {
    this.agents.delete(id)
    this.runners.delete(id)
  }

  updateAgent(def: AgentDefinition): void {
    this.agents.set(def.id, def)
    this.runners.set(def.id, new AgentRunner(def, this.engine, this.basePersonality))
  }

  getAgents(): AgentDefinition[] {
    return Array.from(this.agents.values())
  }

  getEnabledAgents(): AgentDefinition[] {
    return this.getAgents().filter((a) => a.enabled)
  }

  updateBasePersonality(personality: PersonalityConfig): void {
    this.basePersonality = personality
    for (const [id, def] of this.agents) {
      this.runners.set(id, new AgentRunner(def, this.engine, personality))
    }
  }

  // ── Main Entry Point ────────────────────────────────────────────────────────

  async run(userMessage: string): Promise<OrchestrationSession> {
    const session: OrchestrationSession = {
      id: `orch-${Date.now()}`,
      userMessage,
      tasks: [],
      results: [],
      synthesisOutput: '',
      startedAt: Date.now(),
      phase: 'decomposing',
    }
    this.onSessionUpdate({ ...session })

    // Phase 1: Decompose
    let tasks: AgentTask[]
    try {
      tasks = await this.decompose(userMessage)
    } catch (err) {
      session.phase = 'error'
      this.onSessionUpdate({ ...session })
      throw err
    }

    session.tasks = tasks
    session.results = tasks.map((t) => ({
      agentId: t.agentId,
      agentName: this.agents.get(t.agentId)?.name ?? t.agentId,
      status: 'queued' as const,
      output: '',
      partialOutput: '',
      startedAt: 0,
    }))
    session.phase = 'dispatching'
    this.onSessionUpdate({ ...session })

    // Phase 2: Dispatch (sequential for local, parallel for external)
    const isLocal = this.engine.getProvider().type === 'local'
    try {
      if (isLocal) {
        await this.runSequential(session, tasks, userMessage)
      } else {
        await this.runParallel(session, tasks, userMessage)
      }
    } catch (err) {
      session.phase = 'error'
      this.onSessionUpdate({ ...session })
      throw err
    }

    // Phase 3: Synthesize
    session.phase = 'synthesizing'
    this.onSessionUpdate({ ...session })

    try {
      await this.synthesize(session, userMessage)
    } catch (err) {
      session.phase = 'error'
      this.onSessionUpdate({ ...session })
      throw err
    }

    session.phase = 'done'
    session.finishedAt = Date.now()
    this.onSessionUpdate({ ...session })

    return session
  }

  // ── Phase 1: Decompose ──────────────────────────────────────────────────────

  private async decompose(userMessage: string): Promise<AgentTask[]> {
    const enabledAgents = this.getEnabledAgents()
    if (enabledAgents.length === 0) return this.fallbackDecomposition(userMessage)

    const agentList = enabledAgents
      .map((a) => `- ${a.id}: ${a.name} — ${a.description}`)
      .join('\n')

    const systemPrompt = `You are an orchestration controller for a multi-agent AI system.
Your job is to analyze a user's request and decide which specialized agents should work on it.

Available agents:
${agentList}

RULES:
1. Only use agents that add genuine value for this specific request.
2. Assign each agent a clear, specific task description (1-3 sentences, not just "help with this").
3. Use priority numbers: 0 = run first, higher = run later. Same priority = can run in parallel.
4. Do not assign all agents to every request — use judgment.
5. You MUST respond with ONLY valid JSON matching this schema exactly:

{
  "tasks": [
    {
      "agentId": "<agent id from the list above>",
      "taskDescription": "<specific task for this agent>",
      "priority": <integer 0-9>
    }
  ],
  "reasoning": "<one sentence explaining your agent selection>"
}

Respond with JSON only. No preamble, no markdown fences, no extra text.`

    const messages: Message[] = [
      {
        id: `decomp-${Date.now()}`,
        role: 'user',
        content: `User request: "${userMessage}"\n\nDecompose this into agent tasks.`,
        timestamp: Date.now(),
      },
    ]

    const jsonPersonality: PersonalityConfig = {
      ...this.basePersonality,
      temperature: 0.1,
      maxTokens: 1024,
    }

    let raw = ''
    try {
      raw = await this.engine.generate(messages, systemPrompt, jsonPersonality)
    } catch {
      return this.fallbackDecomposition(userMessage)
    }

    // Extract JSON even if the model wrapped it in markdown fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return this.fallbackDecomposition(userMessage)

    let parsed: DecompositionResult
    try {
      parsed = JSON.parse(jsonMatch[0]) as DecompositionResult
    } catch {
      return this.fallbackDecomposition(userMessage)
    }

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return this.fallbackDecomposition(userMessage)
    }

    const validTasks: AgentTask[] = parsed.tasks
      .filter((t) => this.agents.has(t.agentId) && this.agents.get(t.agentId)!.enabled)
      .map((t) => ({
        agentId: t.agentId,
        taskDescription: t.taskDescription,
        contextSnippet: userMessage,
        priority: typeof t.priority === 'number' ? t.priority : 0,
      }))

    return validTasks.length > 0 ? validTasks : this.fallbackDecomposition(userMessage)
  }

  private fallbackDecomposition(userMessage: string): AgentTask[] {
    return [{
      agentId: 'summarizer',
      taskDescription: `Provide a comprehensive, helpful response to: ${userMessage}`,
      contextSnippet: userMessage,
      priority: 0,
    }]
  }

  // ── Phase 2a: Sequential (local llama-server) ───────────────────────────────

  private async runSequential(
    session: OrchestrationSession,
    tasks: AgentTask[],
    userMessage: string
  ): Promise<void> {
    const groups = this.groupByPriority(tasks)
    const priorities = Array.from(groups.keys()).sort((a, b) => a - b)

    for (const priority of priorities) {
      for (const task of groups.get(priority)!) {
        await this.runSingleTask(session, task, userMessage)
      }
    }
  }

  // ── Phase 2b: Parallel (external providers) ─────────────────────────────────
  // NOTE: All AgentRunners share one NeuralEngine instance. When running in
  // parallel, each concurrent generate() call overwrites engine.abortController.
  // abort() will only cancel the most recently started request. This is an
  // accepted trade-off — true per-agent abort requires separate engine instances.

  private async runParallel(
    session: OrchestrationSession,
    tasks: AgentTask[],
    userMessage: string
  ): Promise<void> {
    const groups = this.groupByPriority(tasks)
    const priorities = Array.from(groups.keys()).sort((a, b) => a - b)

    for (const priority of priorities) {
      await Promise.all(
        groups.get(priority)!.map((task) => this.runSingleTask(session, task, userMessage))
      )
    }
  }

  private groupByPriority(tasks: AgentTask[]): Map<number, AgentTask[]> {
    const groups = new Map<number, AgentTask[]>()
    for (const task of tasks) {
      const p = task.priority
      if (!groups.has(p)) groups.set(p, [])
      groups.get(p)!.push(task)
    }
    return groups
  }

  private async runSingleTask(
    session: OrchestrationSession,
    task: AgentTask,
    _userMessage: string
  ): Promise<void> {
    const runner = this.runners.get(task.agentId)
    if (!runner) return

    this.patchResult(session, task.agentId, { status: 'running', startedAt: Date.now() })

    const result = await runner.run(
      task.taskDescription,
      task.contextSnippet,
      (token) => {
        const existing = session.results.find((r) => r.agentId === task.agentId)
        if (existing) {
          this.patchResult(session, task.agentId, {
            partialOutput: existing.partialOutput + token,
          })
        }
      }
    )

    this.patchResult(session, task.agentId, {
      status: result.status,
      output: result.output,
      partialOutput: result.output,
      finishedAt: result.finishedAt,
      error: result.error,
    })
  }

  // ── Phase 3: Synthesis ──────────────────────────────────────────────────────

  private async synthesize(session: OrchestrationSession, userMessage: string): Promise<void> {
    const successful = session.results.filter(
      (r) => r.status === 'done' && r.output.trim().length > 0
    )

    if (successful.length === 0) {
      session.synthesisOutput = 'No agent results were available to synthesize.'
      this.onSessionUpdate({ ...session })
      return
    }

    const agentBlocks = successful
      .map((r) => {
        const def = this.agents.get(r.agentId)
        return `## ${def?.icon ?? ''} ${r.agentName}\n\n${r.output}`
      })
      .join('\n\n---\n\n')

    const messages: Message[] = [
      {
        id: `synth-${Date.now()}`,
        role: 'user',
        content: `Original user request: "${userMessage}"\n\nAgent outputs to synthesize:\n\n${agentBlocks}`,
        timestamp: Date.now(),
      },
    ]

    const summarizerDef = this.agents.get('summarizer')
    const synthSystemPrompt = summarizerDef?.systemPrompt
      ?? 'Synthesize the following agent outputs into a single coherent response for the user.'

    const synthPersonality: PersonalityConfig = {
      ...this.basePersonality,
      temperature: 0.4,
      ...(summarizerDef?.maxTokens ? { maxTokens: summarizerDef.maxTokens } : {}),
    }

    await this.engine.generate(
      messages,
      synthSystemPrompt,
      synthPersonality,
      (token) => {
        session.synthesisOutput += token
        this.onSessionUpdate({ ...session })
      }
    )
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private patchResult(
    session: OrchestrationSession,
    agentId: string,
    patch: Partial<AgentResult>
  ): void {
    session.results = session.results.map((r) =>
      r.agentId === agentId ? { ...r, ...patch } : r
    )
    this.onSessionUpdate({ ...session })
  }

  abort(): void {
    this.engine.stopGeneration()
  }
}
