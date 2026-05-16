import type { NeuralEngine } from '../engine/NeuralEngine'
import type { AgentDefinition, AgentResult, AgentStatus, Message, PersonalityConfig } from '../types'

/**
 * AgentRunner wraps a shared NeuralEngine and maintains isolated context
 * (message history + system prompt) for a single agent definition.
 *
 * Multiple AgentRunners share one NeuralEngine instance.
 * Callers are responsible for serializing calls when the provider is local
 * (single-threaded llama-server). Each run() call creates a fresh isolated
 * history — agents do not accumulate cross-invocation memory by design.
 */
export class AgentRunner {
  readonly definition: AgentDefinition
  private engine: NeuralEngine
  private basePersonality: PersonalityConfig

  constructor(
    definition: AgentDefinition,
    engine: NeuralEngine,
    basePersonality: PersonalityConfig
  ) {
    this.definition = definition
    this.engine = engine
    this.basePersonality = basePersonality
  }

  /**
   * Execute a single task for this agent.
   *
   * @param taskDescription  What the agent should do — injected as user message
   * @param contextSnippet   Optional slice of the original user message for context
   * @param onToken          Streaming callback invoked for each token as it arrives
   */
  async run(
    taskDescription: string,
    contextSnippet: string | undefined,
    onToken: (token: string) => void
  ): Promise<AgentResult> {
    const startedAt = Date.now()

    // Build an isolated message history for this invocation only.
    const messages: Message[] = []

    if (contextSnippet) {
      messages.push({
        id: `ctx-${startedAt}`,
        role: 'user',
        content: `Original user request for context:\n\n${contextSnippet}`,
        timestamp: startedAt,
      })
      messages.push({
        id: `ctx-ack-${startedAt}`,
        role: 'assistant',
        content: 'Understood. I will keep this context in mind while completing my specific task.',
        timestamp: startedAt,
      })
    }

    messages.push({
      id: `task-${startedAt}`,
      role: 'user',
      content: taskDescription,
      timestamp: startedAt,
    })

    // Agent-specific temperature/maxTokens override the base personality.
    const personality: PersonalityConfig = {
      ...this.basePersonality,
      ...(this.definition.temperature !== undefined
        ? { temperature: this.definition.temperature }
        : {}),
      ...(this.definition.maxTokens !== undefined
        ? { maxTokens: this.definition.maxTokens }
        : {}),
    }

    let output = ''
    let status: AgentStatus = 'done'
    let error: string | undefined

    try {
      output = await this.engine.generate(
        messages,
        this.definition.systemPrompt,
        personality,
        (token) => {
          onToken(token)
        }
      )
    } catch (err) {
      status = 'error'
      error = err instanceof Error ? err.message : 'Unknown error'
      output = ''
    }

    return {
      agentId: this.definition.id,
      agentName: this.definition.name,
      status,
      output,
      partialOutput: output,
      startedAt,
      finishedAt: Date.now(),
      error,
    }
  }
}
