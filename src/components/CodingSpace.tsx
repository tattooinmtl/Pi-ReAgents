import { useState, useEffect, useCallback, useRef } from 'react'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  expanded?: boolean
  children?: FileNode[]
}

interface OpenFile {
  path: string
  name: string
  content: string
  modified: boolean
}

interface CodingSpaceProps {
  rootDir: string
  editingFile: { path: string; name: string } | null
  onFileOpen: (file: { path: string; name: string } | null) => void
}

const PREVIEW_EXTS = ['.html', '.htm', '.svg', '.js', '.jsx', '.ts', '.tsx', '.css']

export function CodingSpace({ rootDir, editingFile, onFileOpen }: CodingSpaceProps) {
  const [tree, setTree] = useState<FileNode[]>([])
  const [openFile, setOpenFile] = useState<OpenFile | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedDir, setSelectedDir] = useState(rootDir)
  const [status, setStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState<'none' | 'file' | 'folder'>('none')
  const [confirmDelPath, setConfirmDelPath] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null)
  const [clipboard, setClipboard] = useState<{ mode: 'cut' | 'copy'; path: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const dbRef = useRef(false)

  const api = window.electronAPI

  const loadDir = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    if (!api) return []
    try {
      const entries = await api.readDirectory(dirPath)
      const nodes: FileNode[] = []
      for (const entry of entries) {
        const fullPath = `${dirPath}\\${entry}`
        try {
          const info = await api.pathInfo(fullPath)
          nodes.push({ name: info.name, path: info.path, isDirectory: info.isDirectory, expanded: false, children: [] })
        } catch {}
      }
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return nodes
    } catch { return [] }
  }, [api])

  useEffect(() => {
    loadDir(rootDir).then((n) => { setTree(n); setSelectedDir(rootDir) })
  }, [rootDir, loadDir])

  useEffect(() => {
    if (!editingFile || !api) return
    if (openFile?.path === editingFile.path) return
    api.readFile(editingFile.path).then((content) => {
      setOpenFile({ path: editingFile.path, name: editingFile.name, content, modified: false })
      setShowPreview(false)
    }).catch(() => {})
  }, [editingFile])

  useEffect(() => {
    if (creating !== 'none') inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (renameTarget) setTimeout(() => renameRef.current?.select(), 50)
  }, [renameTarget])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  const writePreview = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe || !openFile) return
    const doc = iframe.contentDocument || iframe.contentWindow!.document
    doc.open()
    if (openFile.name.endsWith('.js')) {
      doc.write(`<html><body><script>${openFile.content}<\/script></body></html>`)
    } else {
      doc.write(openFile.content)
    }
    doc.close()
  }, [openFile])

  useEffect(() => {
    if (showPreview) writePreview()
  }, [showPreview, writePreview])

  const refreshTree = useCallback(async () => {
    const rec = async (d: string): Promise<FileNode[]> => {
      const entries = await loadDir(d)
      for (const e of entries) {
        if (e.isDirectory && (selectedDir.startsWith(e.path) || e.path === selectedDir)) {
          e.expanded = true; e.children = await rec(e.path)
        }
      }
      return entries
    }
    setTree(await rec(rootDir))
  }, [rootDir, selectedDir, loadDir])

  const toggleDir = useCallback(async (node: FileNode) => {
    if (!node.isDirectory) return
    setSelectedDir(node.path)
    const u = { ...node, expanded: !node.expanded }
    if (!node.expanded && (!u.children || u.children.length === 0)) u.children = await loadDir(node.path)
    setTree((prev) => rep(prev, node.path, u))
  }, [loadDir])

  const openContent = useCallback(async (node: FileNode) => {
    if (node.isDirectory || !api || openFile?.path === node.path) return
    try {
      const content = await api.readFile(node.path)
      setOpenFile({ path: node.path, name: node.name, content, modified: false })
      setShowPreview(false)
      onFileOpen({ path: node.path, name: node.name })
    } catch { setStatus(`Error opening ${node.name}`) }
  }, [api, openFile, onFileOpen])

  const handleClick = useCallback((node: FileNode) => {
    if (node.isDirectory) { toggleDir(node); return }
    setSelectedPath(node.path)
    dbRef.current = false
    setTimeout(() => { if (dbRef.current) openContent(node) }, 200)
  }, [toggleDir, openContent])

  const handleDblClick = useCallback((node: FileNode) => {
    if (node.isDirectory) return
    dbRef.current = true; openContent(node)
  }, [openContent])

  const handleCtx = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: node.isDirectory })
  }, [])

  const ctxAction = useCallback(async (action: string) => {
    if (!api || !ctxMenu) return
    const p = ctxMenu.path
    const name = p.split('\\').pop() || ''
    const parent = p.split('\\').slice(0, -1).join('\\')
    setCtxMenu(null)

    if (action === 'delete') { setConfirmDelPath(p); return }
    if (action === 'cut' || action === 'copy') { setClipboard({ mode: action, path: p }); setStatus(`${action === 'cut' ? 'Cut' : 'Copied'} ${name}`); return }
    if (action === 'rename') { setRenameTarget(p); setRenameValue(name); return }
    if (action === 'paste' && clipboard) {
      const dest = ctxMenu.isDir ? `${p}\\${clipboard.path.split('\\').pop()}` : `${parent}\\${clipboard.path.split('\\').pop()}`
      try {
        if (clipboard.mode === 'cut') {
          const content = await api.readFile(clipboard.path)
          await api.createFile(dest, content)
          await api.deleteEntry(clipboard.path)
        } else {
          const content = await api.readFile(clipboard.path)
          await api.createFile(dest, content)
        }
        if (openFile?.path === clipboard.path && clipboard.mode === 'cut') { setOpenFile(null); onFileOpen(null) }
        setClipboard(null)
        setStatus(`Pasted to ${dest.split('\\').pop()}`)
        await refreshTree()
      } catch (err) { setStatus(`Paste failed: ${err instanceof Error ? err.message : 'error'}`) }
      return
    }
    if (action === 'saveas') {
      const newName = prompt('Save as:', name)
      if (!newName) return
      const dest = `${parent}\\${newName}`
      try {
        const content = await api.readFile(p)
        await api.createFile(dest, content)
        setStatus(`Saved as ${newName}`)
        await refreshTree()
      } catch (err) { setStatus(`Save as failed: ${err instanceof Error ? err.message : 'error'}`) }
      return
    }
  }, [api, ctxMenu, clipboard, openFile, onFileOpen, refreshTree])

  const submitRename = useCallback(async () => {
    if (!api || !renameTarget || !renameValue.trim()) { setRenameTarget(null); return }
    const parent = renameTarget.split('\\').slice(0, -1).join('\\')
    const dest = `${parent}\\${renameValue.trim()}`
    try {
      const content = await api.readFile(renameTarget)
      await api.createFile(dest, content)
      await api.deleteEntry(renameTarget)
      if (openFile?.path === renameTarget) {
        setOpenFile({ ...openFile, path: dest, name: renameValue.trim() })
        onFileOpen({ path: dest, name: renameValue.trim() })
      }
      setStatus(`Renamed to ${renameValue.trim()}`)
      await refreshTree()
    } catch (err) { setStatus(`Rename failed: ${err instanceof Error ? err.message : 'error'}`) }
    setRenameTarget(null)
  }, [api, renameTarget, renameValue, openFile, onFileOpen, refreshTree])

  const saveFile = useCallback(async () => {
    if (!openFile || !api) return
    try { await api.writeFile(openFile.path, openFile.content); setOpenFile({ ...openFile, modified: false }); setStatus('Saved') }
    catch { setStatus('Save failed') }
  }, [openFile, api])

  const closeFile = useCallback(() => { setOpenFile(null); setShowPreview(false); onFileOpen(null) }, [onFileOpen])

  const doCreate = useCallback(async () => {
    if (!api || !selectedDir || !createName.trim()) return
    const name = createName.trim()
    const fp = `${selectedDir}\\${name}`
    setCreating('none'); setCreateName('')
    try {
      if (creating === 'file') { await api.createFile(fp, ''); setOpenFile({ path: fp, name, content: '', modified: false }) }
      else { await api.createDirectory(fp) }
      setStatus(`Created ${name}`); await refreshTree()
    } catch (err) { setStatus(`Failed: ${err instanceof Error ? err.message : 'error'}`) }
  }, [api, selectedDir, createName, creating, refreshTree])

  const confirmDelete = useCallback(async () => {
    if (!api || !confirmDelPath) return
    const p = confirmDelPath
    setConfirmDelPath(null)
    try { await api.deleteEntry(p); if (openFile?.path === p) { setOpenFile(null); setShowPreview(false); onFileOpen(null) }; await refreshTree(); setStatus('Deleted') }
    catch { setStatus('Failed to delete') }
  }, [api, confirmDelPath, openFile, refreshTree, onFileOpen])

  const cp = openFile && PREVIEW_EXTS.some(e => openFile.name.endsWith(e))

  const renderNode = (node: FileNode, depth: number): JSX.Element => (
    <div key={node.path}>
      {renameTarget === node.path ? (
        <div className="explorer-node" style={{ paddingLeft: 12 + depth * 16 }}>
          <span className="explorer-icon">{node.isDirectory ? '📁' : '📄'}</span>
          <input ref={renameRef} className="create-input" style={{ flex: 1, marginLeft: 4 }} value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenameTarget(null) }}
            autoFocus />
        </div>
      ) : (
        <div className={`explorer-node ${selectedPath === node.path ? 'explorer-node-selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => handleClick(node)} onDoubleClick={() => handleDblClick(node)}
          onContextMenu={(e) => handleCtx(e, node)}>
          <span className="explorer-icon">{node.isDirectory ? (node.expanded ? '📂' : '📁') : '📄'}</span>
          <span className="explorer-name">{node.name}</span>
          {!node.isDirectory && <span className="explorer-delete" onClick={(e) => { e.stopPropagation(); setConfirmDelPath(node.path) }}>×</span>}
        </div>
      )}
      {node.isDirectory && node.expanded && node.children?.map((c) => renderNode(c, depth + 1))}
    </div>
  )

  return (
    <div className="coding-space">
      <div className="coding-sidebar">
        <div className="explorer-toolbar">
          <span className="explorer-title">Files</span>
          <div className="explorer-actions">
            {creating !== 'none' ? (
              <form onSubmit={(e) => { e.preventDefault(); doCreate() }} className="create-form">
                <input ref={inputRef} className="create-input" value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onBlur={() => { setCreating('none'); setCreateName('') }}
                  placeholder={creating === 'file' ? 'filename.ext' : 'folder-name'} />
              </form>
            ) : (
              <>
                <button className="btn btn-sm btn-secondary" onClick={() => { setCreating('file'); setCreateName('index.html') }}>+ File</button>
                <button className="btn btn-sm btn-secondary" onClick={() => { setCreating('folder'); setCreateName('new-folder') }}>+ Dir</button>
              </>
            )}
          </div>
        </div>
        <div className="explorer-tree">
          {tree.length === 0 && <div className="empty-state" style={{ padding: 20 }}><p>Empty directory</p></div>}
          {tree.map((n) => renderNode(n, 0))}
        </div>
        {status && <div className="explorer-status">{status}</div>}
      </div>
      <div className="coding-editor">
        {openFile ? (
          <>
            <div className="explorer-editor-toolbar">
              <span className="explorer-editor-filename">{openFile.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {showPreview ? (
                  <button className="btn btn-sm btn-secondary" onClick={() => setShowPreview(false)}>← Back to Code</button>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => setShowPreview(true)} disabled={!cp} title={cp ? 'Preview page' : 'Preview only for .html .svg .js files'}>
                    Preview
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={saveFile} disabled={!openFile.modified}>Save</button>
                <button className="btn btn-sm btn-secondary" onClick={closeFile}>Close</button>
              </div>
            </div>
            {showPreview && cp ? (
              <iframe ref={iframeRef} className="coding-preview-iframe" sandbox="allow-scripts allow-same-origin" title="preview" onLoad={writePreview} />
            ) : (
              <textarea className="explorer-editor-textarea" value={openFile.content}
                onChange={(e) => setOpenFile({ ...openFile, content: e.target.value, modified: true })} spellCheck={false} />
            )}
          </>
        ) : (
          <div className="explorer-editor-empty"><p>Double-click a file to edit</p></div>
        )}
      </div>

      {confirmDelPath && (
        <div className="confirm-overlay" onClick={() => setConfirmDelPath(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p>Delete {confirmDelPath.split('\\').pop()}?</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setConfirmDelPath(null)}>Cancel</button>
              <button className="btn btn-sm btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {!ctxMenu.isDir && <button className="ctx-item" onClick={() => ctxAction('open')} disabled>Open</button>}
          <button className="ctx-item" onClick={() => ctxAction('cut')}>Cut</button>
          <button className="ctx-item" onClick={() => ctxAction('copy')}>Copy</button>
          <button className={`ctx-item ${!clipboard ? 'ctx-disabled' : ''}`} onClick={() => ctxAction('paste')} disabled={!clipboard}>Paste</button>
          <button className="ctx-item" onClick={() => ctxAction('rename')}>Rename</button>
          <button className="ctx-item" onClick={() => ctxAction('saveas')}>Save As</button>
          <div className="ctx-divider" />
          <button className="ctx-item ctx-danger" onClick={() => ctxAction('delete')}>Delete</button>
        </div>
      )}
    </div>
  )
}

function rep(nodes: FileNode[], targetPath: string, updated: FileNode): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return updated
    if (n.children) return { ...n, children: rep(n.children, targetPath, updated) }
    return n
  })
}
