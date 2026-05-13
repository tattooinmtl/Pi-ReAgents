import type { ModelConfig, ModelLoadProgress } from '../types'

interface HuggingFaceRepo {
  id: string
  modelId: string
}

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

    const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`
    const targetPath = `${dir}\\${filename}`

    this.reportProgress('downloading', 10, 100)

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`)

    const reader = response.body!.getReader()
    const contentLength = Number(response.headers.get('content-length') || '0')
    const blobParts: BlobPart[] = []
    let receivedLength = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      blobParts.push(value)
      receivedLength += value.length
      if (contentLength) {
        const progress = Math.round((receivedLength / contentLength) * 80) + 10
        this.reportProgress('downloading', progress, 100)
      }
    }

    this.reportProgress('saving', 90, 100)

    const blob = new Blob(blobParts)
    const urlObj = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = urlObj
    a.download = filename
    a.click()
    URL.revokeObjectURL(urlObj)

    this.reportProgress('ready', 100, 100)
    return this.addLocalModel(targetPath)
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
    const id = `local-${fileName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
    const quantMatch = fileName.match(/-(q\d+_\d|q\d+_k_[\w]|q\d+_[\w]+)/i)
    return {
      id,
      name: fileName.replace('.gguf', '').replace('.ggml', ''),
      path: fullPath,
      source: 'local',
      quantization: quantMatch?.[1],
      loaded: false,
    }
  }

  private reportProgress(stage: string, progress: number, total: number) {
    this.onProgress?.({ stage, progress, total })
  }
}
