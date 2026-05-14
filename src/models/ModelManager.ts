import type { ModelConfig, ModelLoadProgress, ChatTemplate } from '../types'

export class ModelManager {
  private models: Map<string, ModelConfig> = new Map()
  private activeModelId: string | null = null
  private onProgress: ((progress: ModelLoadProgress) => void) | null = null
  private baseModelDir: string = ''

  constructor(baseModelDir?: string) {
    if (baseModelDir) this.baseModelDir = baseModelDir
  }

  setBaseDir(dir: string) {
    this.baseModelDir = dir
  }

  setProgressHandler(handler: (progress: ModelLoadProgress) => void) {
    this.onProgress = handler
  }

  async scanLocalModels(dirPath?: string): Promise<ModelConfig[]> {
    const targetDir = dirPath || this.baseModelDir
    if (!targetDir) throw new Error('No model directory specified')

    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')

    const found: ModelConfig[] = []
    const entries = await api.readDirectory(targetDir)

    const ggufFiles = entries.filter(
      (f: string) => f.endsWith('.gguf') || f.endsWith('.ggml')
    )

    for (const file of ggufFiles) {
      const fullPath = `${targetDir}\\${file}`
      const config = this.createLocalConfig(file, fullPath)
      this.models.set(config.id, config)
      found.push(config)
    }

    return found
  }

  async scanLlamaFolder(llamaDir: string): Promise<ModelConfig[]> {
    try {
      return await this.scanLocalModels(llamaDir)
    } catch {
      return []
    }
  }

  async addLocalModel(filePath: string): Promise<ModelConfig> {
    const fileName = filePath.split('\\').pop() || 'model'
    const config = this.createLocalConfig(fileName, filePath)
    this.models.set(config.id, config)
    return config
  }

  async addHuggingFaceModel(
    repoId: string,
    filename: string
  ): Promise<ModelConfig> {
    const id = `hf-${repoId.replace('/', '-')}-${filename}`
    const config: ModelConfig = {
      id,
      name: `${repoId.split('/').pop()} (${filename})`,
      path: '',
      source: 'huggingface',
      huggingfaceRepo: repoId,
      filename,
      loaded: false,
    }

    this.models.set(id, config)
    return config
  }

  async downloadHuggingFaceModel(
    repoId: string,
    filename: string,
    targetDir?: string
  ): Promise<ModelConfig> {
    const dir = targetDir || this.baseModelDir
    if (!dir) throw new Error('No download directory specified')

    this.reportProgress('preparing', 0, 0)

    const api = window.electronAPI
    if (api) {
      const targetPath = await api.downloadHFModel(repoId, filename, dir)
      this.reportProgress('ready', 100, 100)
      return this.addLocalModel(targetPath)
    }

    // Without Electron we cannot write to disk — just tell the user.
    throw new Error(
      'Downloading HuggingFace models requires the Electron desktop app. ' +
      'Please use the desktop version, or download the file manually and use "Load Model".'
    )
  }

  setActiveModel(modelId: string): ModelConfig | undefined {
    const model = this.models.get(modelId)
    if (model) {
      this.activeModelId = modelId
    }
    return model
  }

  getActiveModel(): ModelConfig | undefined {
    return this.activeModelId ? this.models.get(this.activeModelId) : undefined
  }

  getAllModels(): ModelConfig[] {
    return Array.from(this.models.values())
  }

  getLocalModels(): ModelConfig[] {
    return this.getAllModels().filter((m) => m.source === 'local')
  }

  getHuggingFaceModels(): ModelConfig[] {
    return this.getAllModels().filter((m) => m.source === 'huggingface')
  }

  removeModel(modelId: string): boolean {
    if (this.activeModelId === modelId) {
      this.activeModelId = null
    }
    return this.models.delete(modelId)
  }

  private createLocalConfig(fileName: string, fullPath: string): ModelConfig {
    // Include a suffix derived from the full path so two files with the same
    // filename in different directories never collide on the same ID.
    const pathKey = fullPath.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-8)
    const id = `local-${fileName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${pathKey}`
    const quantMatch = fileName.match(/-(q\d+_\d|q\d+_k_[\w]|q\d+_[\w]+)/i)
    return {
      id,
      name: fileName.replace('.gguf', '').replace('.ggml', ''),
      path: fullPath,
      source: 'local',
      quantization: quantMatch?.[1],
      loaded: false,
      chatTemplate: this.detectTemplate(fileName),
    }
  }

  private detectTemplate(fileName: string): ChatTemplate {
    const lower = fileName.toLowerCase()
    if (lower.includes('phi')) return 'phi3'
    if (lower.includes('llama-2') || lower.includes('llama2')) return 'llama2'
    if (lower.includes('qwen') || lower.includes('hermes') || lower.includes('chatml')) return 'chatml'
    // Mistral, Mixtral, Zephyr, CodeLlama, and most others use the zephyr/instruct template
    return 'zephyr'
  }

  private reportProgress(stage: string, progress: number, total: number) {
    this.onProgress?.({ stage, progress, total })
  }
}
