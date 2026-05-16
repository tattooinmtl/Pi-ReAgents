const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  readDirectory: (path) => ipcRenderer.invoke('read-directory', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  downloadHFModel: (repoId, filename, targetDir) => ipcRenderer.invoke('download-hf-model', repoId, filename, targetDir),
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  createFile: (path, content) => ipcRenderer.invoke('create-file', path, content),
  createDirectory: (path) => ipcRenderer.invoke('create-directory', path),
  deleteEntry: (path) => ipcRenderer.invoke('delete-entry', path),
  pathExists: (path) => ipcRenderer.invoke('path-exists', path),
  pathInfo: (path) => ipcRenderer.invoke('path-info', path),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getLlamaDir: () => ipcRenderer.invoke('get-llama-dir'),
  getModelsDir: () => ipcRenderer.invoke('get-models-dir'),
  getWorkspaceDir: () => ipcRenderer.invoke('get-workspace-dir'),
  startServer: (modelPath) => ipcRenderer.invoke('start-llama-server', modelPath),
  stopServer: () => ipcRenderer.invoke('stop-llama-server'),
  getServerLogs: () => ipcRenderer.invoke('get-server-logs'),
  onServerLog: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('server-log', handler)
    return () => ipcRenderer.removeListener('server-log', handler)
  },
  startTerminal: (cwd) => ipcRenderer.invoke('start-terminal', cwd),
  sendTerminalInput: (input) => ipcRenderer.invoke('terminal-input', input),
  stopTerminal: () => ipcRenderer.invoke('stop-terminal'),
  onTerminalOutput: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('terminal-output', handler)
    return () => ipcRenderer.removeListener('terminal-output', handler)
  },
  openFileDialog: (filters) => ipcRenderer.invoke('select-file', filters),
  openDirectoryDialog: () => ipcRenderer.invoke('select-directory'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action)
    ipcRenderer.on('menu-action', handler)
    return () => ipcRenderer.removeListener('menu-action', handler)
  },
  sendAppState: (state) => ipcRenderer.send('app-state-change', state),
})
