export interface PathInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: number
}

export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  readFile: (path: string) => Promise<string>
  readDirectory: (path: string) => Promise<string[]>
  writeFile: (path: string, content: string) => Promise<void>
  downloadHFModel: (repoId: string, filename: string, targetDir: string) => Promise<string>
  onDownloadProgress: (callback: (data: { repoId: string; filename: string; pct: number }) => void) => () => void
  createFile: (path: string, content?: string) => Promise<void>
  createDirectory: (path: string) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pathInfo: (path: string) => Promise<PathInfo>
  getAppPath: () => Promise<string>
  getLlamaDir: () => Promise<string>
  getModelsDir: () => Promise<string>
  getWorkspaceDir: () => Promise<string>
  startServer: (modelPath: string) => Promise<void>
  stopServer: () => Promise<void>
  getServerLogs: () => Promise<string>
  onServerLog: (callback: (data: string) => void) => () => void
  startTerminal: (cwd?: string) => Promise<void>
  sendTerminalInput: (input: string) => Promise<void>
  stopTerminal: () => Promise<void>
  onTerminalOutput: (callback: (data: string) => void) => () => void
  openFileDialog: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openDirectoryDialog: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
