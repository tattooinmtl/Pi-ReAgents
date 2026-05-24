export interface PathInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: number
}

export interface ModelAutoConfig {
  architecture:        string | null
  nativeContextLength: number | null
  chatTemplate:        string | null
  modelSizeMB:         number
  hardware: {
    totalRamMB: number
    freeRamMB:  number
    vramMB:     number
    gpuName:    string | null
  }
  ctxSize: number
  ngl:     number
}

export interface ElectronAPI {
  openFileDialog: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectoryDialog: () => Promise<string | null>
  selectDirectory: () => Promise<string | null>
  readFile: (path: string) => Promise<string>
  readDirectory: (path: string) => Promise<string[]>
  writeFile: (path: string, content: string) => Promise<void>
  downloadHFModel: (repoId: string, filename: string, targetDir: string) => Promise<string>
  onDownloadProgress?: (callback: (data: { repoId: string; filename: string; pct: number; received: number; total: number }) => void) => () => void
  createFile: (path: string, content?: string) => Promise<void>
  createDirectory: (path: string) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pathInfo: (path: string) => Promise<PathInfo>
  getAppPath: () => Promise<string>
  getLlamaDir: () => Promise<string>
  getModelsDir: () => Promise<string>
  getWorkspaceDir: () => Promise<string>
  startServer: (modelPath: string, config?: { ctxSize?: number; ngl?: number }) => Promise<void>
  scanModel: (modelPath: string) => Promise<ModelAutoConfig>
  stopServer: () => Promise<void>
  getServerLogs: () => Promise<string>
  onServerLog: (callback: (data: string) => void) => () => void
  onServerCrash?: (callback: (data: { code: number | null }) => void) => () => void
  startTerminal: (cwd?: string) => Promise<void>
  sendTerminalInput: (input: string) => Promise<void>
  stopTerminal: () => Promise<void>
  onTerminalOutput: (callback: (data: string) => void) => () => void
  quitApp?: () => Promise<void>
  onMenuAction?: (callback: (action: string) => void) => () => void
  sendAppState?: (state: Record<string, boolean>) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
