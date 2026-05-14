# Full Code Audit — Pi-ReAgents AI (llama-interface)
**Date:** 2026-05-13  
**Auditor:** Claude Sonnet 4.6  
**Files reviewed:** All `src/**/*.{ts,tsx}` (20 files)

---

## CRITICAL — Fix immediately (bugs / broken features)

---

### 1. Double file-open on every double-click — `FileExplorer.tsx` & `CodingSpace.tsx`

**Files:** [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx#L122-L139), [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx#L143-L153)

**Problem:** The single-click / double-click disambiguation logic is inverted. The browser fires `onClick` first, then `onDoubleClick`. The implementation:
1. `handleNodeClick` fires → sets `dbRef.current = false`, schedules a 200ms timeout
2. `handleNodeDoubleClick` fires immediately → sets `dbRef.current = true`, opens the file
3. 200ms later the timeout checks `dbRef.current === true` → opens the file **a second time**

`openFileContent` / `openContent` is called **twice** on every double-click.

**Fix:** Set `dbRef.current = true` in the click handler when a double-click is detected, not in the double-click handler. Or remove the timeout entirely — single-click selects, double-click opens. The current pattern is the wrong inversion.

---

### 2. `startServer()` does not await `stopServer()` — `NeuralEngine.ts:28`

**File:** [src/engine/NeuralEngine.ts](src/engine/NeuralEngine.ts#L27-L47)

```ts
async startServer(modelPath: string): Promise<void> {
  this.stopServer()   // ← not awaited — race condition
  this.status = 'loading'
```

The old server process may still be alive when the new one starts. This can cause port 8080 conflicts, a failed `waitForServer()`, and a frozen loading state.

**Fix:** `await this.stopServer()` before proceeding.

---

### 3. `useEffect` cleanup listeners are never unsubscribed — `App.tsx:65-126`

**File:** [src/App.tsx](src/App.tsx#L65-L126)

```ts
useEffect(() => {
  const init = async () => {
    // ...
    const unsubLogs = api.onServerLog(...)
    const unsubDl   = api.onDownloadProgress?.(...)
    return () => { unsubLogs?.(); unsubDl?.() }  // ← returned from async init(), ignored
  }
  init()                                          // ← Promise result (with cleanup) is discarded

  return () => { engine.stopServer() }            // ← real cleanup, misses the unsubs
}, [])
```

The inner cleanup function is the return value of the async `init()` Promise. React never calls it. Every app mount leaks two Electron IPC listeners (`onServerLog`, `onDownloadProgress`).

**Fix:** Hoist the unsub refs outside the async function and call them in the outer cleanup.

---

### 4. "New Session" doesn't start a new memory session — `App.tsx:520-522` + `MemoryManager.ts`

**File:** [src/App.tsx](src/App.tsx#L520-L522), [src/memory/MemoryManager.ts](src/memory/MemoryManager.ts#L50-L54)

```ts
const handleNewSession = useCallback(async () => {
  setMessages([])  // ← only clears the UI
}, [])
```

`MemoryManager.currentSession` is never reset. The next `saveMessage()` call still appends to the **old session**. Clicking "New Session" has no effect on memory — all messages continue accumulating in the previous session.

**Fix:** Call `memoryManager.currentSession = null` (or expose a `resetSession()` method) inside `handleNewSession`.

---

### 5. `deleteSession()` empties the file instead of deleting it — `MemoryManager.ts:97-116`

**File:** [src/memory/MemoryManager.ts](src/memory/MemoryManager.ts#L97-L116)

```ts
if (file) {
  await api.writeFile(filePath, '')  // ← writes "" to the file, does not delete it
}
```

After a restart, `scanSessions()` finds the empty file again, parses zero messages, and re-adds the session as a ghost entry. Deleted sessions reappear after every restart.

**Fix:** Call `api.deleteEntry(filePath)` instead of `api.writeFile(filePath, '')`.

---

### 6. NeuralEngine internal status stays `'loading'` after server start failure — `NeuralEngine.ts`

**File:** [src/engine/NeuralEngine.ts](src/engine/NeuralEngine.ts#L27-L47), [src/App.tsx](src/App.tsx#L468-L476)

When `waitForServer()` throws, the engine's `this.status` is never set to `'error'` — it stays `'loading'`. App.tsx catches the error and calls `setBackendStatus('error')` in React state, but `engine.getStatus()` still returns `'loading'`. A subsequent `useEffect` that reads `engine.getStatus()` (line 133) will then report the wrong state.

**Fix:** Add a `catch` block inside `startServer()` that sets `this.status = 'error'` before re-throwing.

---

## HIGH — Significant logic errors or missing features

---

### 7. AI has no conversation history — every message is a fresh prompt — `App.tsx:154-157`

**File:** [src/App.tsx](src/App.tsx#L154-L157)

```ts
const fullPrompt = `${personality.systemPrompt}${skillContext}${fileContext}\n\nUser: ${content}`
```

Only the **current user message** is sent to the model. The entire `messages` array is in state but never included in the prompt. The AI cannot refer to anything said earlier in the same session. This is a fundamental chat feature that is completely absent.

**Fix:** Build a multi-turn prompt from `messages` history before appending the new user message. Respect `contextLength` and truncate from the oldest end.

---

### 8. Prompt template format is hardcoded to Zephyr/StableLM — `NeuralEngine.ts:150-158`

**File:** [src/engine/NeuralEngine.ts](src/engine/NeuralEngine.ts#L150-L158)

```ts
parts.push(`<|system|>\n${personality.systemPrompt}`)
parts.push(`<|user|>\n${userInput}`)
parts.push('<|assistant|>\n')
```

Llama 2 uses `[INST]`, Mistral uses `[INST]`, Phi-3 uses `<|user|>` (compatible), CodeLlama uses `[INST]`, and ChatML uses `<|im_start|>`. Every suggested model in `ModelManagerUI` uses a different template. Quality will be severely degraded for most models.

**Fix:** Add a `chatTemplate` field to `ModelConfig` and select the format when building the prompt. At minimum, expose a raw-prompt fallback.

---

### 9. Model ID collision for two models with the same filename — `ModelManager.ts:165-176`

**File:** [src/models/ModelManager.ts](src/models/ModelManager.ts#L165-L176)

```ts
const id = `local-${fileName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
```

`/models/foo/mistral-7b.gguf` and `/models/bar/mistral-7b.gguf` produce the same ID `local-mistral-7b-gguf`. The second scan silently overwrites the first entry in the Map. The user sees one model when two should be listed.

**Fix:** Include the directory path or a hash of the full path in the ID.

---

### 10. Browser-mode HuggingFace download registers a non-existent path — `ModelManager.ts:121-131`

**File:** [src/models/ModelManager.ts](src/models/ModelManager.ts#L121-L131)

```ts
const a = document.createElement('a')
a.href = urlObj; a.download = filename; a.click()   // triggers browser Save dialog
URL.revokeObjectURL(urlObj)

return this.addLocalModel(targetPath)  // ← targetPath doesn't exist yet; user hasn't saved
```

The model is registered immediately at `targetPath` (`dir\filename`) before the user even picks a save location. Starting the server with this path will fail.

**Fix:** In non-Electron mode, do not auto-register the model. Show a message instructing the user to manually add the downloaded file.

---

### 11. Rename and paste in CodingSpace only work on files, not directories — `CodingSpace.tsx:203-218`

**File:** [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx#L203-L219)

```ts
const submitRename = useCallback(async () => {
  const content = await api.readFile(renameTarget)  // ← fails on directory
  await api.createFile(dest, content)               // ← creates a file where a dir was
  await api.deleteEntry(renameTarget)
```

Renaming or pasting a directory calls `api.readFile()` on a directory path, which will throw. The operation silently fails with a status message but leaves things in a broken state.

**Fix:** Check `node.isDirectory` before the rename/paste operation. For directories, either disable those context-menu options or implement a directory-aware move using a dedicated API call.

---

### 12. `CODE_ASSISTANT_SKILL` object is recreated on every render — `App.tsx:243-263`

**File:** [src/App.tsx](src/App.tsx#L243-L263)

The `CODE_ASSISTANT_SKILL` constant is declared **inside the `App` component body**. It is a large multi-line object that is re-allocated on every render. Since `handleToggleCodeAssistant` has a `useCallback` but `CODE_ASSISTANT_SKILL` is not in its deps, it captures a stale reference (though content never changes, so no runtime bug — but this is wasteful and misleading).

**Fix:** Move `CODE_ASSISTANT_SKILL` outside the component at module scope.

---

### 13. `handleLoadModel` and `handleFileInputChange` are missing `registerModel` in deps — `App.tsx`

**Files:** [src/App.tsx](src/App.tsx#L341-L350), [src/App.tsx](src/App.tsx#L453-L459)

```ts
const handleLoadModel = useCallback(async () => {
  // ...calls registerModel(filePath)
}, [modelManager, engine])   // ← registerModel missing from deps
```

`registerModel` is a non-memoized inner function that captures `addLog`, `modelManager`, etc. Because it's not in the deps array, the `useCallback` closures could call a stale version. In practice this is fine today, but it will become a real bug if any dep changes after mount.

**Fix:** Add `registerModel` to both `useCallback` dep arrays, or wrap `registerModel` in `useCallback` itself.

---

## MEDIUM — Inconsistencies, code smells, missing polish

---

### 14. `finalMsg` in `handleSend` is built but never shown in the UI — `App.tsx:185-194`

**File:** [src/App.tsx](src/App.tsx#L185-L194)

```ts
const finalMsg: Message = {
  id: `msg-${Date.now() + 1}`,  // different ID from the streaming assistantMsg
  role: 'assistant',
  content: response,
  ...
}
// setMessages is NOT called — finalMsg is only passed to memoryManager
await memoryManager.saveMessage(finalMsg)
```

The streaming message (`assistantMsg`) is what the user sees. `finalMsg` is a second object saved to disk with a **different ID**. When a session is loaded, the restored messages have IDs that never existed in the UI. This is harmless but confusing and indicates a design inconsistency.

**Fix:** Save the in-flight `assistantMsg` (with its `content` updated to `response`) to memory instead of creating `finalMsg`.

---

### 15. `backendStatus` React state only syncs when `activeModel` changes — `App.tsx:132-134`

**File:** [src/App.tsx](src/App.tsx#L132-L134)

```ts
useEffect(() => {
  setBackendStatus(engine.getStatus())
}, [activeModel])
```

If the engine transitions to `'error'` after a server crash (without `activeModel` changing), the UI status badge stays showing `'ready'`. The engine status and the displayed badge drift apart.

**Fix:** Expose an event/callback from `NeuralEngine` for status changes, or poll periodically, or rely entirely on explicit `setBackendStatus` calls at every engine interaction site (which App.tsx already does in most places — the `useEffect` above is then redundant and misleading).

---

### 16. `modelManager` prop received by `ModelManagerUI` is never used — `ModelManagerUI.tsx:2-3`

**File:** [src/components/ModelManagerUI.tsx](src/components/ModelManagerUI.tsx#L2-L12)

`ModelManager` is imported and typed as a prop but the component only uses the `models: ModelConfig[]` array passed separately. The `modelManager` instance is dead code in this component.

**Fix:** Remove `modelManager` from `ModelManagerUIProps` and its import.

---

### 17. `ElectronAPI` type defines duplicate method aliases — `electron.d.ts`

**File:** [src/types/electron.d.ts](src/types/electron.d.ts)

The interface has both:
- `selectDirectory()` and `openDirectoryDialog()`
- `selectFile()` and `openFileDialog()`

App.tsx uses `selectDirectory()` in one place (line 271) and `openDirectoryDialog()` in another (line 218). This means the actual Electron preload must implement both names, or one call will silently return `undefined`.

**Fix:** Pick one name per operation and remove the duplicate. Update all call sites consistently.

---

### 18. `FileNode` and `OpenFile` interfaces are duplicated in two components

**Files:** [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx#L4-L17), [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx#L4-L17)

Both components define identical `FileNode` and `OpenFile` interfaces locally. Any future change must be made in two places.

**Fix:** Move both interfaces to `src/types/index.ts` and import them.

---

### 19. Loaded session messages get non-deterministic IDs — `MemoryManager.ts:196`

**File:** [src/memory/MemoryManager.ts](src/memory/MemoryManager.ts#L196)

```ts
id: `msg-${Date.now()}-${messages.length}`,
```

Every time a session is loaded from disk, every message receives a **new ID** based on the current timestamp. If a session is loaded twice (or compared), React will re-render all message nodes unnecessarily and any stable-reference logic breaks.

**Fix:** Persist the `id` field inside the session's markdown file and parse it back. Or derive a stable ID from `timestamp` + `role` + index.

---

### 20. Personality file is loaded without schema validation — `App.tsx:88-92`

**File:** [src/App.tsx](src/App.tsx#L88-L92)

```ts
const parsed = JSON.parse(saved)
if (parsed.systemPrompt) setPersonality((prev) => ({ ...prev, ...parsed }))
```

If the saved file contains extra or malformed keys (or `NaN` values from a corrupted save), they are spread directly into the personality config without any type checking. A corrupted `personality.json` could set `temperature` to `null` or `"bad"` and silently break inference.

**Fix:** Validate each key and type before accepting the parsed value.

---

### 21. `handleNodeClick` in FileExplorer selects a file but doesn't open it — `FileExplorer.tsx:122-134`

**File:** [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx#L122-L134)

The `dblClickRef` timeout fires `openFileContent` only when `dblClickRef.current` is `true`, but `dblClickRef.current` is set to `false` at the start of every single-click. Given the double-click bug in issue #1, **no single-click ever opens a file**. Files only open on double-click — which itself opens twice. Single-click only sets `selectedPath` (highlights the node).

This is a UX inconsistency: there is no single-click to open. The UI has no indicator that double-click is required.

---

## LOW — Code quality / minor issues

---

### 22. Single-letter variable names throughout `CodingSpace.tsx`

**File:** [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx)

Variables named `n`, `e`, `u`, `p`, `fp`, `cp`, `d`, `rec`, `dbRef` make the code hard to read and maintain. `dbRef` especially looks like a database reference. This is the largest and most complex component in the codebase.

---

### 23. `writePreview` iframe uses `doc.write()` with raw user content — `FileExplorer.tsx:82-93`, `CodingSpace.tsx:95-106`, `CodePreview.tsx:24-34`

**Files:** [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx#L82-L93), [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx#L95-L106), [src/components/CodePreview.tsx](src/components/CodePreview.tsx#L24-L34)

`doc.write(openFile.content)` injects arbitrary content. With `sandbox="allow-scripts allow-same-origin"` any script in the file executes in the same Electron origin. In a desktop Electron app this is the intended behavior for local HTML files, but it is worth noting this allows any local file opened in the editor to execute arbitrary code in the renderer process. Ensure `nodeIntegration` is disabled in the Electron main process.

---

### 24. `refreshTree()` in both explorer components issues N recursive API calls on every file-system change

**Files:** [src/components/FileExplorer.tsx](src/components/FileExplorer.tsx#L158-L170), [src/components/CodingSpace.tsx](src/components/CodingSpace.tsx#L112-L123)

Every create, rename, delete, or paste triggers a full recursive re-scan of all expanded directories. For large trees this generates a cascade of IPC calls.

**Fix:** Only re-scan the affected subtree.

---

### 25. `console.log` / debug statements left in production code — `NeuralEngine.ts`

**File:** [src/engine/NeuralEngine.ts](src/engine/NeuralEngine.ts#L35-L40)

```ts
console.log('[NeuralEngine] Spawning llama-server via Electron IPC')
console.log('[NeuralEngine] No Electron API — assuming llama-server is already running on :8080')
```

These are visible in the DevTools console in production builds.

---

### 26. `buildPrompt` in NeuralEngine silently ignores the `n_ctx` mismatch

**File:** [src/engine/NeuralEngine.ts](src/engine/NeuralEngine.ts#L93)

`n_ctx: personality.contextLength` is sent per-request via the API body, but llama-server's context is set at startup. If the model was loaded with a smaller context than `contextLength`, the server silently clamps it. There is no warning or feedback to the user.

---

### 27. `SkillsManager.parseSkillFile` returns `null` for files with no body — `SkillsManager.ts:128-130`

**File:** [src/skills/SkillsManager.ts](src/skills/SkillsManager.ts#L128-L130)

```ts
const body = lines.slice(contentStart).join('\n').trim()
if (!body) return null
```

A skill file with only front-matter (e.g., a newly created empty file) silently fails to load with no error message to the user. The caller in `loadFromDirectory` swallows the result with `if (skill)`. The user has no indication their skill file was rejected.

---

### 28. `MemoryManager.createSession` only creates the date directory when Electron is available — `MemoryManager.ts:39-43`

**File:** [src/memory/MemoryManager.ts](src/memory/MemoryManager.ts#L39-L43)

```ts
if (api) {
  const dir = `${this.baseDir}\\${dateStr}`
  await this.ensureDir(dir)
}
this.sessions.set(id, session)
```

The session is added to the in-memory map regardless of whether directory creation succeeded. If `ensureDir` throws, the session object exists in memory but has no backing directory, and the next `saveMessage` will fail.

---

## Summary Table

| # | File | Severity | Issue |
|---|------|----------|-------|
| 1 | FileExplorer / CodingSpace | CRITICAL | Double file-open on every double-click |
| 2 | NeuralEngine.ts | CRITICAL | stopServer() not awaited — race condition |
| 3 | App.tsx | CRITICAL | IPC event listeners never unsubscribed |
| 4 | App.tsx + MemoryManager | CRITICAL | "New Session" doesn't actually start new session |
| 5 | MemoryManager.ts | CRITICAL | deleteSession empties file, not deletes — ghosts on restart |
| 6 | NeuralEngine.ts | CRITICAL | Engine status stays 'loading' on startup error |
| 7 | App.tsx | HIGH | No conversation history sent to model |
| 8 | NeuralEngine.ts | HIGH | Prompt template hardcoded for one model family |
| 9 | ModelManager.ts | HIGH | Model ID collision for same filename in different dirs |
| 10 | ModelManager.ts | HIGH | Browser HF download registers non-existent file path |
| 11 | CodingSpace.tsx | HIGH | Rename/paste crashes on directories |
| 12 | App.tsx | HIGH | CODE_ASSISTANT_SKILL recreated every render |
| 13 | App.tsx | HIGH | registerModel missing from useCallback deps |
| 14 | App.tsx | MEDIUM | finalMsg never shown in UI, saved with different ID |
| 15 | App.tsx | MEDIUM | backendStatus can drift from engine internal status |
| 16 | ModelManagerUI.tsx | MEDIUM | modelManager prop received but never used |
| 17 | electron.d.ts | MEDIUM | Duplicate API method aliases (selectFile vs openFileDialog) |
| 18 | FileExplorer + CodingSpace | MEDIUM | FileNode / OpenFile interfaces duplicated |
| 19 | MemoryManager.ts | MEDIUM | Loaded messages get new random IDs each load |
| 20 | App.tsx | MEDIUM | Personality loaded without schema validation |
| 21 | FileExplorer.tsx | MEDIUM | Single-click never opens a file |
| 22 | CodingSpace.tsx | LOW | Illegible single-letter variable names |
| 23 | FileExplorer / CodingSpace / CodePreview | LOW | iframe doc.write injects raw content |
| 24 | FileExplorer / CodingSpace | LOW | Full recursive tree re-scan on every change |
| 25 | NeuralEngine.ts | LOW | console.log left in production paths |
| 26 | NeuralEngine.ts | LOW | n_ctx mismatch gives no user feedback |
| 27 | SkillsManager.ts | LOW | Empty skill file rejected silently |
| 28 | MemoryManager.ts | LOW | Session registered in Map even if dir creation fails |
