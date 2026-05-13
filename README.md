# Pi-ReAgents AI

An advanced desktop interface for Llama.cpp with built-in code editor, terminal, file manager, and skill-based AI assistant.

## Features

- **Chat Interface** — Streaming LLM responses with personality tuning (temperature, top-p, mirostat)
- **Code Assistant** — Built-in coding skill with syntax-highlighted code blocks, Run preview, and Apply-to-file
- **File Explorer** — Full file tree with create/edit/save/delete, double-click to open in editor
- **Code Editor** — Edit files directly, preview HTML/SVG output, save changes
- **Terminal** — Integrated cmd.exe shell for pip/npm/git commands
- **Memory Manager** — Date-stamped session persistence with search
- **Model Manager** — Load local .gguf models, download from Hugging Face
- **Skills System** — Load markdown-based skills from files or folders
- **Personality Config** — Fine-tune temperature, top-k, repeat penalty, system prompt
- **Console** — Real-time server logs and app events

## Quick Start

1. Place a `.gguf` model file in the `models\` folder (see below for downloads)
2. Run `startAll.bat`:
   ```
   startAll.bat
   ```
   This starts `llama-server.exe` on port 8080 and launches the Electron app.

Or manually:
```
npm run electron:dev
```

## Downloading GGUF Models

GGUF is the file format used by Llama.cpp for running LLMs locally. You can download them from Hugging Face:

### Recommended Models

| Model | Size | Download |
|-------|------|----------|
| Gemma 4 4B | ~3.5 GB | `hf.co/bartowski/gemma-4-E4B-it-GGUF` |
| Llama 3.2 3B | ~2 GB | `hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF` |
| Mistral 7B | ~4.5 GB | `hf.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF` |
| Phi-3 Mini 3.8B | ~2.5 GB | `hf.co/microsoft/Phi-3-mini-4k-instruct-gguf` |
| TinyLlama 1.1B | ~700 MB | `hf.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF` |

### How to Download

**Option A — From Hugging Face website:**
1. Go to the model page (e.g. `https://huggingface.co/bartowski/gemma-4-E4B-it-GGUF`)
2. Click **Files and versions**
3. Find a file ending in `Q4_K_M.gguf` (best balance of size/quality)
4. Download it and place in the `models\` folder

**Option B — Using the Model Manager in the app:**
1. Open the app and click **Models** in the bottom bar
2. Under "Hugging Face Download" pick a suggested model or enter a repo/filename
3. Click **Download** — it saves directly to `models\`

### Quantization Types

GGUF files come in different quantizations. `Q4_K_M` is recommended:

| Type | Quality | Size |
|------|---------|------|
| Q2_K | Lowest | Smallest |
| Q4_K_M | Good balance | Medium |
| Q5_K_M | Better quality | Larger |
| Q8_0 | Near original | Very large |

## Changing the Model in startAll.bat

The `startAll.bat` starts `llama-server.exe` with a specific model. To use a different model:

1. Open `startAll.bat` in a text editor
2. Find this line:
   ```
   start "llama-server" cmd /k "C:\canpro\llama-interface\llama\llama-server.exe -m C:\canpro\llama-interface\models\gemma-4-E4B-it-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 2048 -ngl 99"
   ```
3. Replace the model path after `-m` with your new model:
   ```
   -m C:\canpro\llama-interface\models\your-model-name.Q4_K_M.gguf
   ```
4. Save and run `startAll.bat` again

### Running Without startAll.bat

You can also start the server manually in a terminal:
```
C:\canpro\llama-interface\llama\llama-server.exe -m C:\canpro\llama-interface\models\your-model.gguf --host 127.0.0.1 --port 8080 -c 2048 -ngl 99
```

Then in another terminal:
```
npm run electron:dev
```

The app will connect to the running server on port 8080.

## Requirements

- Node.js 18+
- Windows (for llama binaries included in `llama\` folder)
- GGUF model file in `models\` folder

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Desktop:** Electron 31
- **LLM Backend:** Llama.cpp via `llama-server.exe` (HTTP API on port 8080)

## Keyboard Shortcuts

- `Enter` — Send message
- `Shift+Enter` — New line in chat
- Click `▲ Console` — Toggle server logs
- Double-click file — Open in editor
