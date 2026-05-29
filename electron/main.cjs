const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn, exec } = require('child_process')

// ─── GGUF metadata parser ────────────────────────────────────────────────────
// Reads the KV header of a GGUF file to extract architecture, native context
// length, and the raw Jinja2 chat template (if present).
function parseGGUFMeta(filePath) {
  const MAX_READ = 48 * 1024 * 1024 // 48 MB covers even large-vocabulary models
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(MAX_READ)
    const bytesRead = fs.readSync(fd, buf, 0, MAX_READ, 0)
    const data = buf.slice(0, bytesRead)
    let o = 0 // current byte offset

    const u8  = () => { const v = data.readUInt8(o);        o += 1; return v }
    const i8  = () => { const v = data.readInt8(o);         o += 1; return v }
    const u16 = () => { const v = data.readUInt16LE(o);     o += 2; return v }
    const i16 = () => { const v = data.readInt16LE(o);      o += 2; return v }
    const u32 = () => { const v = data.readUInt32LE(o);     o += 4; return v }
    const i32 = () => { const v = data.readInt32LE(o);      o += 4; return v }
    const f32 = () => { const v = data.readFloatLE(o);      o += 4; return v }
    const f64 = () => { const v = data.readDoubleLE(o);     o += 8; return v }
    const u64 = () => {
      const lo = data.readUInt32LE(o), hi = data.readUInt32LE(o + 4)
      o += 8
      return hi * 0x100000000 + lo
    }
    const str = () => {
      const len = u64()
      const s = data.toString('utf8', o, o + len)
      o += len
      return s
    }

    function readValue(type) {
      switch (type) {
        case 0:  return u8()
        case 1:  return i8()
        case 2:  return u16()
        case 3:  return i16()
        case 4:  return u32()
        case 5:  return i32()
        case 6:  return f32()
        case 7:  return u8() !== 0         // bool
        case 8:  return str()
        case 9: {                           // array
          const at = u32(), al = u64()
          if (at === 8) {                   // string array – must iterate
            const arr = []
            for (let i = 0; i < al; i++) arr.push(str())
            return arr
          }
          // fixed-size array – skip bytes
          const sizes = [1,1,2,2,4,4,4,1,0,0,8,8,8]
          o += (sizes[at] || 4) * al
          return null
        }
        case 10: return u64()
        case 11: return u64()              // int64 treated as uint64 (safe for ctx lengths)
        case 12: return f64()
        default: throw new Error(`Unknown GGUF value type ${type}`)
      }
    }

    if (data.toString('ascii', 0, 4) !== 'GGUF') throw new Error('Not a GGUF file')
    o = 4
    const version = u32()
    // skip n_tensors, then read n_kv
    if (version >= 2) { u64() } else { u32() }
    const kvCount = version >= 2 ? u64() : u32()

    const result = { architecture: null, contextLength: null, chatTemplateRaw: null }

    for (let i = 0; i < kvCount; i++) {
      if (o >= bytesRead - 32) break // near buffer edge — stop safely
      const key = str()
      const valueType = u32()
      const value = readValue(valueType)
      if (key === 'general.architecture')           result.architecture    = value
      else if (key.endsWith('.context_length'))     result.contextLength   = value
      else if (key === 'tokenizer.ggml.chat_template') result.chatTemplateRaw = value
    }

    return result
  } catch (e) {
    // Return partial results rather than crashing
    return { architecture: null, contextLength: null, chatTemplateRaw: null, parseError: e.message }
  } finally {
    fs.closeSync(fd)
  }
}

function detectTemplateFromJinja(template) {
  if (!template) return null
  if (template.includes('<|im_start|>'))                            return 'chatml'
  if (template.includes('[INST]'))                                  return 'llama2'
  if (template.includes('<|user|>') && template.includes('<|end|>')) return 'phi3'
  if (template.includes('<|user|>'))                                return 'zephyr'
  return 'zephyr'
}

// ─── Hardware detection ───────────────────────────────────────────────────────
async function getSystemInfo() {
  const totalRamMB = Math.round(os.totalmem() / 1024 / 1024)
  const freeRamMB  = Math.round(os.freemem()  / 1024 / 1024)
  let vramMB = 0
  let gpuName = null

  if (process.platform === 'win32') {
    try {
      const raw = await new Promise((resolve) => {
        exec(
          'powershell -NoProfile -Command "Get-WmiObject Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json -Compress"',
          { timeout: 4000 },
          (_err, stdout) => resolve(stdout || '')
        )
      })
      const info = JSON.parse(raw.trim())
      gpuName = info.Name || null
      vramMB  = info.AdapterRAM ? Math.round(info.AdapterRAM / 1024 / 1024) : 0
    } catch {}
  }

  return { totalRamMB, freeRamMB, vramMB, gpuName }
}

// ─── Auto-config computation ──────────────────────────────────────────────────
function computeAutoConfig(hw, modelSizeMB, nativeCtx) {
  const { freeRamMB, vramMB } = hw
  // Use VRAM if large enough to hold the model, otherwise fall back to system RAM
  const gpuAvailMB  = vramMB > modelSizeMB ? vramMB - modelSizeMB - 512  : 0
  const ramAvailMB  = Math.max(0, freeRamMB - modelSizeMB - 1024)
  const headroomMB  = gpuAvailMB > 0 ? gpuAvailMB : ramAvailMB

  // Rough KV-cache cost: ~0.5 MB per 1 k tokens for a 4 GB model, scales linearly
  const kvMBper1kTok = Math.max(0.1, 0.5 * (modelSizeMB / 4096))
  const tokenCapacity = headroomMB > 0 ? Math.floor(headroomMB / kvMBper1kTok) * 1000 : 4096
  const maxAllowed    = Math.min(nativeCtx || 131072, tokenCapacity)

  const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072]
  const ctxSize   = CTX_STEPS.reduce((best, s) => (s <= maxAllowed ? s : best), 2048)
  const ngl       = vramMB > 512 ? 99 : 0  // full GPU offload if any meaningful VRAM

  return { ctxSize, ngl }
}

let mainWindow = null
let llamaServerProcess = null
let serverLogs = []
let terminalProcess = null

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')

function getLlamaDir() {
  if (isDev) return path.join(__dirname, '..', 'llama')
  return path.join(process.resourcesPath, 'llama')
}

// Kill all llama-server.exe processes — tracked AND externally started (e.g. startAll.bat).
// Returns a promise that resolves once taskkill completes (or immediately on non-Windows).
function killAllLlamaServers() {
  if (llamaServerProcess) {
    try { llamaServerProcess.kill('SIGTERM') } catch {}
    llamaServerProcess = null
  }
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve()
    exec('taskkill /F /IM llama-server.exe /T', () => resolve())
  })
}

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

let splashWindow = null

function sendSplashProgress(step, message) {
  try { splashWindow?.webContents.send('splash-progress', { step, message }) } catch {}
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 360,
    frame: false,
    transparent: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/img/LogoApp.ico'),
  })

  const splashPath = isDev
    ? path.join(__dirname, '../public/splash.html')
    : path.join(__dirname, '../dist/splash.html')

  splashWindow.loadFile(splashPath)
  splashWindow.on('closed', () => { splashWindow = null })
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
    icon: path.join(__dirname, '../public/img/LogoApp.ico'),
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5076')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

async function startupSequence() {
  Menu.setApplicationMenu(null)

  // Ensure user-data directories exist on first launch (production)
  if (!isDev) {
    const dirs = [
      path.join(process.resourcesPath, 'models'),
      path.join(process.resourcesPath, 'workspace'),
    ]
    for (const d of dirs) {
      try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) } catch {}
    }
  }

  // Step 0 — show splash immediately
  createSplashWindow()
  await new Promise(r => setTimeout(r, 300))

  // Step 1 — load the main window in background
  sendSplashProgress(1, 'Loading interface…')
  createWindow()
  await new Promise(r => setTimeout(r, 400))

  // Step 2 — interface bundle parsing
  sendSplashProgress(2, 'Preparing AI engine…')
  await new Promise(r => setTimeout(r, 500))

  // Step 3 — wait for main window to be ready
  sendSplashProgress(3, 'Starting model server…')
  await new Promise((resolve) => {
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', resolve)
    } else {
      resolve()
    }
  })
  await new Promise(r => setTimeout(r, 300))

  // Step 4 — ready, hand off
  sendSplashProgress(4, 'Ready!')
  await new Promise(r => setTimeout(r, 600))

  // Close splash, show main
  mainWindow.show()
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
}

app.whenReady().then(() => startupSequence())

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => killServer())

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
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

ipcMain.handle('get-app-path', () => app.getPath('userData'))
ipcMain.handle('get-llama-dir', () => getLlamaDir())

ipcMain.handle('get-models-dir', () => {
  if (isDev) return path.join(__dirname, '..', 'models')
  return path.join(process.resourcesPath, 'models')
})

ipcMain.handle('get-workspace-dir', () => {
  if (isDev) return path.join(__dirname, '..', 'workspace')
  return path.join(process.resourcesPath, 'workspace')
})

// Shared server spawn logic used by both start-llama-server and restart-server.
// config: optional { ctxSize: number, ngl: number }
function spawnLlamaServer(modelPath, config) {
  const llamaDir = getLlamaDir()
  const serverExe = path.join(llamaDir, 'llama-server.exe')

  if (!fs.existsSync(serverExe)) {
    return Promise.reject(new Error(`llama-server.exe not found at ${serverExe}`))
  }

  // Persist the active model path so reload.bat can read it without needing the app.
  try {
    fs.writeFileSync(path.join(getLlamaDir(), 'last-model.txt'), modelPath, 'utf-8')
  } catch {}

  const ctxSize = config?.ctxSize || 4096
  const ngl     = config?.ngl     ?? 99

  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', '8080',
      '-ngl', String(ngl),
      '--ctx-size', String(ctxSize),
    ]

    llamaServerProcess = spawn(serverExe, args, {
      cwd: llamaDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverLogs = []
    let started = false

    const onData = (data) => {
      const text = data.toString()
      serverLogs.push(text)
      try { mainWindow?.webContents.send('server-log', text) } catch {}
      if (!started && (text.includes('http://') || text.includes('model loaded'))) {
        started = true
        resolve()
      }
    }

    llamaServerProcess.stdout.on('data', onData)
    llamaServerProcess.stderr.on('data', (data) => {
      const text = data.toString()
      serverLogs.push(text)
      try { mainWindow?.webContents.send('server-log', text) } catch {}
      if (!started && (text.includes('http://') || text.includes('build info') || text.includes('model loaded'))) {
        started = true
        resolve()
      }
    })

    llamaServerProcess.on('error', (err) => { if (!started) reject(err) })
    llamaServerProcess.on('exit', (code) => {
      llamaServerProcess = null
      if (!started) {
        reject(new Error(`Server exited with code ${code}`))
      } else {
        // Crash after a successful start — notify the renderer
        try { mainWindow?.webContents.send('server-crashed', { code }) } catch {}
      }
    })

    // Resolve after 5 s if we haven't detected the ready string yet (some builds are quiet).
    setTimeout(() => { if (!started) { started = true; resolve() } }, 5000)
  })
}

ipcMain.handle('start-llama-server', async (_event, modelPath, config) => {
  // Kill BOTH the tracked process and any external llama-server.exe (e.g. from startAll.bat).
  await killAllLlamaServers()
  // Give the OS a moment to release port 8080 before we bind again.
  await new Promise((r) => setTimeout(r, 600))
  return spawnLlamaServer(modelPath, config)
})

// Scan a model file: parse GGUF metadata, detect hardware, compute optimal config.
ipcMain.handle('scan-model', async (_event, modelPath) => {
  const [gguf, hw] = await Promise.all([
    Promise.resolve(parseGGUFMeta(modelPath)),
    getSystemInfo(),
  ])

  const modelSizeMB = (() => {
    try { return Math.round(fs.statSync(modelPath).size / 1024 / 1024) } catch { return 4096 }
  })()

  const detectedTemplate = detectTemplateFromJinja(gguf.chatTemplateRaw)
  const { ctxSize, ngl } = computeAutoConfig(hw, modelSizeMB, gguf.contextLength)

  return {
    architecture:      gguf.architecture,
    nativeContextLength: gguf.contextLength,
    chatTemplate:      detectedTemplate,
    modelSizeMB,
    hardware:          hw,
    ctxSize,
    ngl,
  }
})

ipcMain.handle('stop-llama-server', async () => {
  await killAllLlamaServers()
})

ipcMain.handle('get-server-logs', () => serverLogs.join(''))

// ── Download HuggingFace model ────────────────────────────────────────────────
// Uses proper stream backpressure so the main-process event loop stays free
// during large (multi-GB) downloads and won't freeze the renderer IPC.
ipcMain.handle('download-hf-model', async (_event, repoId, filename, targetDir) => {
  const https = require('https')
  const http = require('http')
  const startUrl = `https://huggingface.co/${repoId}/resolve/main/${filename}`
  const targetPath = path.join(targetDir, path.basename(filename))

  return new Promise((resolve, reject) => {
    let received = 0
    let lastReportedPct = -1
    let writer = null

    const doRequest = (requestUrl, redirectCount) => {
      if (redirectCount > 10) return reject(new Error('Too many redirects'))
      const lib = requestUrl.startsWith('https') ? https : http
      const req = lib.get(requestUrl, {
        headers: { 'User-Agent': 'llama-interface/1.0' }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume()
          return doRequest(res.headers.location, redirectCount + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        }

        const contentLength = Number(res.headers['content-length'] || '0')
        writer = fs.createWriteStream(targetPath)

        writer.on('error', (err) => { req.destroy(); reject(err) })

        res.on('data', (chunk) => {
          received += chunk.length
          if (contentLength) {
            const pct = Math.round((received / contentLength) * 100)
            if (pct !== lastReportedPct) {
              lastReportedPct = pct
              try { mainWindow?.webContents.send('download-progress', { repoId, filename, pct, received, total: contentLength }) } catch {}
            }
          }
        })

        res.on('error', (err) => { writer.destroy(); reject(err) })

        res.pipe(writer)

        writer.on('finish', () => resolve(targetPath))
      })

      req.on('error', (err) => { if (writer) writer.destroy(); reject(err) })
    }

    doRequest(startUrl, 0)
  })
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

ipcMain.handle('path-exists', async (_event, entryPath) => fs.existsSync(entryPath))

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
  if (terminalProcess) terminalProcess.stdin.write(input + '\n')
})

ipcMain.handle('stop-terminal', () => {
  if (terminalProcess) {
    try { terminalProcess.kill() } catch {}
    terminalProcess = null
  }
})
