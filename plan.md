# Pi-ReAgents AI — Codebase Audit & Bug Tracker

## App.tsx — State Hub (668 lines)

| Function | Status | Notes |
|----------|--------|-------|
| `init useEffect` | ✅ OK | Scans models, loads personality, initializes memory/skills dirs |
| `addLog` | ✅ OK | Stable ref (empty deps), used across all handlers |
| `handleSend` | ⚠️ **BUG** | `addLog` not in dependency array. Works at runtime due to stable ref but flagged by lint |
| `handleStop` | ✅ OK | Simple abort, no deps issue |
| `handleLoadSkillsDirectory` | ✅ OK | |
| `handleLoadSkillsFile` | ✅ OK | |
| `handleOpenFiles` | ⚠️ **BUG** | Uses `prompt()` dialog which can be unreliable in Electron renderer. If prompt returns null, falls through silently. |
| `handleToggleCodingSpace` | ✅ OK | Gets workspace dir, creates if needed, sets both `explorerRoot` + `codingSpace` |
| `handleToggleCodeAssistant` | 🔴 **WAS BROKEN — FIXED** | Side effects were inside `setState` updater function (React may call updaters multiple times). Moved to async callback body with proper await flow. Now sets explorerRoot + codingSpace together. |
| `handleToggleSkill` | ✅ OK | |
| `handleRemoveSkill` | ✅ OK | |
| `handleLoadModel` | ✅ OK | |
| `handleRestartServer` | ⚠️ **BUG** | `addLog` missing from deps |
| `registerModel` | ✅ OK | standalone async function, not useCallback |
| `handleSavePersonality` | ⚠️ **BUG** | `addLog` missing from deps |
| `handleClearLogs` | ✅ OK | |
| `handlePreview` | 🔴 **DEAD CODE** | Function defined on line 424 but never called — Run button was removed from Chat. `preview` state + `CodePreview` import still in App.tsx |
| `handleOpenInCodingSpace` | ✅ OK | Creates ai-gen file, opens coding space |
| `handleApplyCode` | ⚠️ **BUG** | `_lang` unused param. `addLog` not in deps. |
| `handleFileInputChange` | ✅ OK | |
| `handleSelectModel` | ✅ OK | Starts server, sets status |
| `handleDownloadHF` | ⚠️ **BUG** | `addLog` not in deps |
| `handleRemoveModel` | ✅ OK | |
| `handleLoadSession` | ✅ OK | |
| `handleDeleteSession` | ✅ OK | |
| `handleNewSession` | ✅ OK | |
| `LANG_EXT` constant | ✅ OK | Maps code block languages to file extensions |

### State Variables

| Variable | Used? | Notes |
|----------|-------|-------|
| `preview` | 🔴 Unused | Was for Run button, no way to trigger now |
| `showConsole` | ✅ | Toggled via BottomPanel Console button |
| `showTerminal` | ✅ | Toggled via BottomPanel Terminal button |
| `showExplorer` | ✅ | Opens FileExplorer as floating window |
| `showPersonality/Skills/Models/Memory` | ✅ | Modal dialogs |
| `explorerRoot` | ✅ | Set by code assistant, coding space, or files button |
| `openEditingFile` | ✅ | Passed between CodingSpace and AI prompt context |
| All others | ✅ | |

---

## Components

### BottomPanel.tsx (117 lines)
| Prop | Status | Notes |
|------|--------|-------|
| `status, activeModelName, skillsCount, etc` | ✅ OK | All passed and rendered |
| `onToggleCodeAssistant` | ✅ | Code ON/OFF toggle |
| `onToggleCodingSpace` | ✅ | Opens split view |
| `onOpenConsole` | ✅ | Opens floating console window |
| `onOpenTerminal` | ✅ | Opens floating terminal window |
| `onOpenFiles` | ✅ | Opens floating file explorer |
| `onRestartServer` | ✅ | Kills and restarts llama-server.exe |

### Chat.tsx (142 lines)
| Function | Status | Notes |
|----------|--------|-------|
| `ChatMessage` component | ✅ OK | Renders code blocks with Code Space + Apply buttons |
| `Chat` component | ✅ OK | Handles input, sends to engine |
| `handleSubmit` | ✅ OK | Enter to send, Shift+Enter for newline |
| `personality` prop removed | ✅ FIXED | Was unused, removed from interface |

### CodingSpace.tsx (239 lines)
| Function | Status | Notes |
|----------|--------|-------|
| `loadDir` | ✅ OK | Reads directory, sorts folders first |
| `toggleDir` | ✅ OK | Expand/collapse + set selectedDir |
| `openContent` | ✅ OK | Reads file, sets editor, calls onFileOpen |
| `handleClick / handleDblClick` | ⚠️ **Race cond.** | 200ms timeout for dblclick detection can double-fire if user clicks fast |
| `saveFile` | ✅ OK | Writes via Electron IPC |
| `closeFile` | ✅ OK | Clears editor state |
| `doCreate` | ✅ OK | Creates file/folder via IPC, refreshes tree |
| `delEntry` | ⚠️ **BUG** | Uses `confirm()` which can be unreliable in Electron renderer |
| `refreshTree` | ✅ OK | Recursive load with path match |
| Preview mode | ✅ OK | Toggle between editor/iframe, "← Back to Code" button |
| External `editingFile` watch | ✅ OK | `useEffect` watches prop, opens file |

### Console.tsx (31 lines)
| Function | Status | Notes |
|----------|--------|-------|
| Renders logs in DraggableWindow | ✅ OK | Docks bottom-right |

### Terminal.tsx (65 lines)
| Function | Status | Notes |
|----------|--------|-------|
| `startTerminal` IPC | ✅ OK | Spawns cmd.exe |
| `sendTerminalInput` IPC | ✅ OK | Writes to stdin |
| `onTerminalOutput` IPC | ✅ OK | Streams stdout/stderr to renderer |

### DraggableWindow.tsx (95 lines)
| Function | Status | Notes |
|----------|--------|-------|
| Drag by titlebar | ✅ OK | Uses mousedown/mousemove/mouseup |
| Resize by corner handle | ✅ OK | Min 200x120 |
| Dock via ⊟ button | ⚠️ **BUG** | Dock position calculated once, doesn't update on window resize |
| Close via × | ✅ OK | Calls onClose |

### FileExplorer.tsx (322 lines)
| Function | Status | Notes |
|----------|--------|-------|
| `floating` prop | ✅ OK | Wraps in DraggableWindow when true, modal-overlay otherwise |
| Inline create input | ✅ OK | Replaces prompt() with proper input field |
| Single/double click logic | ⚠️ Same as CodingSpace | 200ms race possible |

### CodePreview.tsx (84 lines)
| Function | Status | Notes |
|----------|--------|-------|
| Draggable floating preview | ✅ OK | Custom drag, not using DraggableWindow |
| JS wrapping | ✅ OK | Wraps in HTML page for execution |
| **Entire component** | 🔴 **UNUSED** | No way to trigger it since Run removed from Chat |

---

## Engine / Models / Skills / Memory

### NeuralEngine.ts
| Function | Status | Notes |
|----------|--------|-------|
| `startServer` | ✅ OK | Falls back to HTTP if no Electron API |
| `generate` (HTTP) | ⚠️ **BUG** | Doesn't send `mirostat`, `contextLength`, `mirostatTau`, `mirostatEta` to server — these personality settings are silently ignored |
| `generate` (Native) | ✅ OK | Full param support |
| `stopGeneration` | ✅ OK | Aborts fetch |
| `unloadModel` | ✅ OK | |
| `waitForServer` | ✅ OK | Polls /health endpoint |
| Error status | 🔴 **MISSING** | `NeuralEngine` never sets internal status to `'error'` — App.tsx manages its own `backendStatus` state separately |

### ModelManager.ts
| Function | Status | Notes |
|----------|--------|-------|
| `scanLocalModels` | ✅ OK | Reads .gguf/.ggml files |
| `scanLlamaFolder` | ✅ OK | Wraps scanLocalModels in try-catch |
| `addLocalModel` | ✅ OK | Creates config, adds to map |
| `downloadHuggingFaceModel` | ✅ OK | Uses Electron IPC download when available, fallback to browser download |
| Unused `HuggingFaceRepo` interface | ✅ REMOVED | |

### SkillsManager.ts
| Function | Status | Notes |
|----------|--------|-------|
| `loadFromDirectory` | ✅ OK | |
| `loadSingleFile` | ✅ OK | |
| `addSkill` | ✅ OK | Added for built-in skills |
| `toggleSkill` | ✅ OK | |
| `getEnabledSkills` | ✅ OK | |
| `getCombinedSystemPrompt` | ✅ OK | |

### MemoryManager.ts
| Function | Status | Notes |
|----------|--------|-------|
| `initialize` | ✅ OK | Scans date-stamped session dirs |
| `createSession` | ✅ OK | Named by date/time |
| `saveMessage` | ✅ OK | Appends to session .md file |
| `loadSession` | ✅ OK | Parses session file back to Message[] |
| `ensureDir` | ✅ OK | Uses `createDirectory` IPC (was using writeFile, fixed) |

---

## Electron IPC (main.cjs + preload.cjs)

| Channel | Status | Notes |
|---------|--------|-------|
| `select-directory` | ✅ OK | Native dialog |
| `select-file` | ✅ OK | Native dialog with filters |
| `read-file` | ✅ OK | `fs.readFileSync` |
| `read-directory` | ✅ OK | `fs.readdirSync` |
| `write-file` | ✅ OK | `fs.writeFileSync` utf-8 |
| `create-file` | ✅ OK | `fs.writeFileSync` for empty files |
| `create-directory` | ✅ OK | `fs.mkdirSync` recursive |
| `delete-entry` | ✅ OK | `fs.rmSync` or `unlinkSync` |
| `path-info` | ✅ OK | `fs.statSync` |
| `download-hf-model` | ✅ OK | Node.js `fetch` + `fs.createWriteStream` streaming download |
| `start-llama-server` | ✅ OK | Spawns `llama-server.exe` with model path |
| `stop-llama-server` | ✅ OK | Kills process |
| `start-terminal` | ✅ OK | Spawns `cmd.exe` |
| `terminal-input` | ✅ OK | Writes to stdin |
| `stop-terminal` | ✅ OK | Kills process |
| `get-models-dir` | ✅ OK | Returns `project/models/` |
| `get-workspace-dir` | OK | Returns `project/workspace/` |

---

## Bug Summary — Priority Order

### 🔴 Critical (breaks UX)
1. ~~`handleToggleCodeAssistant` — side effects inside state updater~~ **FIXED**
2. ~~`handleToggleCodeAssistant` — `explorerRoot` never set before `setCodingSpace(true)`~~ **FIXED**

### 🟡 Medium (minor breakage)
3. `handlePreview` / `CodePreview` / `preview` state — dead code, no way to trigger
4. `DraggableWindow` dock position — stale when window resizes
5. `NeuralEngine.generate` HTTP mode — mirostat/context params dropped
6. `confirm()` in `delEntry` — unreliable in Electron renderer
7. `prompt()` in `handleOpenFiles` + `handleToggleCodeAssistant` — unreliable in Electron

### 🟢 Low (cosmetic / lint)
8. `addLog` missing from deps in 6 useCallbacks
9. `_lang` unused parameter in `handleApplyCode`
10. 200ms dblclick timeout — can double-fire if user clicks fast
