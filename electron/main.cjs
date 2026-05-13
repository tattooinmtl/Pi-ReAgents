const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let mainWindow = null
let llamaServerProcess = null
let serverLogs = []
let terminalProcess = null

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

function getLlamaDir() {
  if (isDev) {
    return path.join(__dirname, '..', 'llama')
  }
  return path.join(process.resourcesPath, 'llama')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/img/LogoApp.png'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5076')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  killServer()
})

function killServer() {
  if (llamaServerProcess) {
    try { llamaServerProcess.kill('SIGTERM') } catch {}
    llamaServerProcess = null
  }
  if (terminalProcess) {
    try { terminalProcess.kill() } catch {}
    terminalProcess = null
  }
}

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('select-file', async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('read-file', async (_event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('read-directory', async (_event, dirPath) => {
  return fs.readdirSync(dirPath)
})

ipcMain.handle('write-file', async (_event, filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf-8')
})

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData')
})

ipcMain.handle('get-llama-dir', () => {
  return getLlamaDir()
})

ipcMain.handle('get-models-dir', () => {
  if (isDev) return path.join(__dirname, '..', 'models')
  return path.join(process.resourcesPath, 'models')
})

ipcMain.handle('get-workspace-dir', () => {
  if (isDev) return path.join(__dirname, '..', 'workspace')
  return path.join(process.resourcesPath, 'workspace')
})

ipcMain.handle('start-llama-server', async (_event, modelPath) => {
  killServer()

  const llamaDir = getLlamaDir()
  const serverExe = path.join(llamaDir, 'llama-server.exe')

  if (!fs.existsSync(serverExe)) {
    throw new Error(`llama-server.exe not found at ${serverExe}`)
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', '8080',
      '-ngl', '99',
      '--ctx-size', '4096',
    ]

    llamaServerProcess = spawn(serverExe, args, {
      cwd: llamaDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let started = false

    serverLogs = []

    llamaServerProcess.stdout.on('data', (data) => {
      const text = data.toString()
      serverLogs.push(text)
      try { mainWindow?.webContents.send('server-log', text) } catch {}
      if (!started && text.includes('http://')) {
        started = true
        resolve()
      }
    })

    llamaServerProcess.stderr.on('data', (data) => {
      const text = data.toString()
      serverLogs.push(text)
      try { mainWindow?.webContents.send('server-log', text) } catch {}
      if (!started && (text.includes('http://') || text.includes('build info'))) {
        started = true
        resolve()
      }
    })

    llamaServerProcess.on('error', (err) => {
      if (!started) reject(err)
    })

    llamaServerProcess.on('exit', (code) => {
      llamaServerProcess = null
      if (!started) reject(new Error(`Server exited with code ${code}`))
    })

    setTimeout(() => {
      if (!started) {
        started = true
        resolve()
      }
    }, 5000)
  })
})

ipcMain.handle('stop-llama-server', () => {
  killServer()
})

ipcMain.handle('get-server-logs', () => {
  return serverLogs.join('')
})

ipcMain.handle('download-hf-model', async (_event, repoId, filename, targetDir) => {
  const url = `https://huggingface.co/${repoId}/resolve/main/${filename}`
  const targetPath = path.join(targetDir, filename)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  const reader = response.body.getReader()
  const writer = fs.createWriteStream(targetPath)
  const contentLength = Number(response.headers.get('content-length') || '0')
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    writer.write(Buffer.from(value))
    received += value.length
    if (contentLength) {
      const pct = Math.round((received / contentLength) * 100)
      try { mainWindow?.webContents.send('download-progress', { repoId, filename, pct }) } catch {}
    }
  }
  writer.end()
  return targetPath
})

ipcMain.handle('create-file', async (_event, filePath, content) => {
  fs.writeFileSync(filePath, content || '', 'utf-8')
})

ipcMain.handle('create-directory', async (_event, dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true })
})

ipcMain.handle('delete-entry', async (_event, entryPath) => {
  const stat = fs.statSync(entryPath)
  if (stat.isDirectory()) {
    fs.rmSync(entryPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(entryPath)
  }
})

ipcMain.handle('path-exists', async (_event, entryPath) => {
  return fs.existsSync(entryPath)
})

ipcMain.handle('path-info', async (_event, entryPath) => {
  const stat = fs.statSync(entryPath)
  return {
    name: path.basename(entryPath),
    path: entryPath,
    isDirectory: stat.isDirectory(),
    size: stat.size,
    modified: stat.mtimeMs,
  }
})

ipcMain.handle('start-terminal', async (_event, cwd) => {
  if (terminalProcess) { try { terminalProcess.kill() } catch {} }

  return new Promise((resolve) => {
    terminalProcess = spawn('cmd.exe', [], {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })

    terminalProcess.stdout.on('data', (data) => {
      try { mainWindow?.webContents.send('terminal-output', data.toString()) } catch {}
    })

    terminalProcess.stderr.on('data', (data) => {
      try { mainWindow?.webContents.send('terminal-output', data.toString()) } catch {}
    })

    terminalProcess.on('exit', () => {
      terminalProcess = null
      try { mainWindow?.webContents.send('terminal-output', '\nProcess exited.\n') } catch {}
    })

    resolve()
  })
})

ipcMain.handle('terminal-input', async (_event, input) => {
  if (terminalProcess) {
    terminalProcess.stdin.write(input + '\n')
  }
})

ipcMain.handle('stop-terminal', () => {
  if (terminalProcess) {
    try { terminalProcess.kill() } catch {}
    terminalProcess = null
  }
})
