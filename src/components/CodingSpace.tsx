import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileNode, OpenFile } from '../types'

interface CodingSpaceProps {
  rootDir: string
  editingFile: { path: string; name: string } | null
  onFileOpen: (file: { path: string; name: string } | null) => void
}

type ClipboardEntry = { mode: 'cut' | 'copy'; path: string; isDir: boolean }

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
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

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
    loadDir(rootDir).then((nodes) => { setTree(nodes); setSelectedDir(rootDir) })
  }, [rootDir, loadDir])

  useEffect(() => {
    if (!editingFile || !api) return
    if (openFile?.path === editingFile.path) return
    api.readFile(editingFile.path).then((content) => {
      setOpenFile({ path: editingFile.path, name: editingFile.name, content, modified: false })
      setShowPreview(false)
    }).catch(() => {})
  }, [editingFile]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const loadRecursive = async (dir: string): Promise<FileNode[]> => {
      const entries = await loadDir(dir)
      for (const entry of entries) {
        if (entry.isDirectory && (selectedDir.startsWith(entry.path) || entry.path === selectedDir)) {
          entry.expanded = true
          entry.children = await loadRecursive(entry.path)
        }
      }
      return entries
    }
    setTree(await loadRecursive(rootDir))
  }, [rootDir, selectedDir, loadDir])

  const toggleDir = useCallback(async (node: FileNode) => {
    if (!node.isDirectory) return
    setSelectedDir(node.path)
    const updated = { ...node, expanded: !node.expanded }
    if (!node.expanded && (!updated.children || updated.children.length === 0)) {
      updated.children = await loadDir(node.path)
    }
    setTree((prev) => replaceNode(prev, node.path, updated))
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

  // Single-click: select (highlight). Double-click: open.
  const handleClick = useCallback((node: FileNode) => {
    if (node.isDirectory) {
      toggleDir(node)
    } else {
      setSelectedPath(node.path)
    }
  }, [toggleDir])

  const handleDblClick = useCallback((node: FileNode) => {
    if (node.isDirectory) return
    openContent(node)
  }, [openContent])

  const handleCtx = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: node.isDirectory })
  }, [])

  const ctxAction = useCallback(async (action: string) => {
    if (!api || !ctxMenu) return
    const targetPath = ctxMenu.path
    const targetName = targetPath.split('\\').pop() || ''
    const parentDir = targetPath.split('\\').slice(0, -1).join('\\')
    setCtxMenu(null)

    if (action === 'delete') {
      setConfirmDelPath(targetPath)
      return
    }

    if (action === 'cut' || action === 'copy') {
      setClipboard({ mode: action, path: targetPath, isDir: ctxMenu.isDir })
      setStatus(`${action === 'cut' ? 'Cut' : 'Copied'} ${targetName}`)
      return
    }

    if (action === 'rename') {
      if (ctxMenu.isDir) {
        setStatus('Directory rename is not supported — please use the file system.')
        return
      }
      setRenameTarget(targetPath)
      setRenameValue(targetName)
      return
    }

    if (action === 'paste' && clipboard) {
      if (clipboard.isDir) {
        setStatus('Directory paste is not supported.')
        return
      }
      const destDir = ctxMenu.isDir ? targetPath : parentDir
      const dest = `${destDir}\\${clipboard.path.split('\\').pop()}`
      try {
        const content = await api.readFile(clipboard.path)
        await api.createFile(dest, content)
        if (clipboard.mode === 'cut') {
          await api.deleteEntry(clipboard.path)
          if (openFile?.path === clipboard.path) { setOpenFile(null); onFileOpen(null) }
        }
        setClipboard(null)
        setStatus(`Pasted to ${dest.split('\\').pop()}`)
        await refreshTree()
      } catch (err) {
        setStatus(`Paste failed: ${err instanceof Error ? err.message : 'error'}`)
      }
      return
    }

    if (action === 'saveas') {
      if (ctxMenu.isDir) {
        setStatus('Save As is not supported for directories.')
        return
      }
      const newName = prompt('Save as:', targetName)
      if (!newName) return
      const dest = `${parentDir}\\${newName}`
      try {
        const content = await api.readFile(targetPath)
        await api.createFile(dest, content)
        setStatus(`Saved as ${newName}`)
        await refreshTree()
      } catch (err) {
        setStatus(`Save as failed: ${err instanceof Error ? err.message : 'error'}`)
      }
    }
  }, [api, ctxMenu, clipboard, openFile, onFileOpen, refreshTree])

  const submitRename = useCallback(async () => {
    if (!api || !renameTarget || !renameValue.trim()) { setRenameTarget(null); return }
    const parentDir = renameTarget.split('\\').slice(0, -1).join('\\')
    const dest = `${parentDir}\\${renameValue.trim()}`
    try {
      const content = await api.readFile(renameTarget)
      await api.createFile(dest, content)
      await api.deleteEntry(renameTarget)
      if (openFile?.path === renameTarget) {
        const renamed = { ...openFile, path: dest, name: renameValue.trim() }
        setOpenFile(renamed)
        onFileOpen({ path: dest, name: renameValue.trim() })
      }
      setStatus(`Renamed to ${renameValue.trim()}`)
      await refreshTree()
    } catch (err) {
      setStatus(`Rename failed: ${err instanceof Error ? err.message : 'error'}`)
    }
    setRenameTarget(null)
  }, [api, renameTarget, renameValue, openFile, onFileOpen, refreshTree])

  const saveFile = useCallback(async () => {
    if (!openFile || !api) return
    try {
      await api.writeFile(openFile.path, openFile.content)
      setOpenFile({ ...openFile, modified: false })
      setStatus('Saved')
    } catch { setStatus('Save failed') }
  }, [openFile, api])

  const closeFile = useCallback(() => {
    setOpenFile(null)
    setShowPreview(false)
    onFileOpen(null)
  }, [onFileOpen])

  const doCreate = useCallback(async () => {
    if (!api || !selectedDir || !createName.trim()) return
    const name = createName.trim()
    const fullPath = `${selectedDir}\\${name}`
    setCreating('none')
    setCreateName('')
    try {
      if (creating === 'file') {
        await api.createFile(fullPath, '')
        setOpenFile({ path: fullPath, name, content: '', modified: false })
      } else {
        await api.createDirectory(fullPath)
      }
      setStatus(`Created ${name}`)
      await refreshTree()
    } catch (err) { setStatus(`Failed: ${err instanceof Error ? err.message : 'error'}`) }
  }, [api, selectedDir, createName, creating, refreshTree])

  const confirmDelete = useCallback(async () => {
    if (!api || !confirmDelPath) return
    const targetPath = confirmDelPath
    setConfirmDelPath(null)
    try {
      await api.deleteEntry(targetPath)
      if (openFile?.path === targetPath) { setOpenFile(null); setShowPreview(false); onFileOpen(null) }
      await refreshTree()
      setStatus('Deleted')
    } catch { setStatus('Failed to delete') }
  }, [api, confirmDelPath, openFile, refreshTree, onFileOpen])

  const canPreview = openFile && PREVIEW_EXTS.some(ext => openFile.name.endsWith(ext))

  const renderNode = (node: FileNode, depth: number): JSX.Element => (
    <div key={node.path}>
      {renameTarget === node.path ? (
        <div className="explorer-node" style={{ paddingLeft: 12 + depth * 16 }}>
          <span className="explorer-icon">{node.isDirectory ? '📁' : '📄'}</span>
          <input
            ref={renameRef}
            className="create-input"
            style={{ flex: 1, marginLeft: 4 }}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
              if (e.key === 'Escape') setRenameTarget(null)
            }}
            autoFocus
          />
        </div>
      ) : (
        <div
          className={`explorer-node ${selectedPath === node.path ? 'explorer-node-selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => handleClick(node)}
          onDoubleClick={() => handleDblClick(node)}
          onContextMenu={(e) => handleCtx(e, node)}
        >
          <span className="explorer-icon">{node.isDirectory ? (node.expanded ? '📂' : '📁') : '📄'}</span>
          <span className="explorer-name">{node.name}</span>
          {!node.isDirectory && (
            <span className="explorer-delete" onClick={(e) => { e.stopPropagation(); setConfirmDelPath(node.path) }}>×</span>
          )}
        </div>
      )}
      {node.isDirectory && node.expanded && node.children?.map((child) => renderNode(child, depth + 1))}
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
                <input
                  ref={inputRef}
                  className="create-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onBlur={() => { setCreating('none'); setCreateName('') }}
                  placeholder={creating === 'file' ? 'filename.ext' : 'folder-name'}
                />
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
          {tree.map((node) => renderNode(node, 0))}
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
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowPreview(true)}
                    disabled={!canPreview}
                    title={canPreview ? 'Preview page' : 'Preview only for .html .svg .js files'}
                  >
                    Preview
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={saveFile} disabled={!openFile.modified}>Save</button>
                <button className="btn btn-sm btn-secondary" onClick={closeFile}>Close</button>
              </div>
            </div>
            {showPreview && canPreview ? (
              <iframe ref={iframeRef} className="coding-preview-iframe" sandbox="allow-scripts allow-same-origin" title="preview" onLoad={writePreview} />
            ) : (
              <textarea
                className="explorer-editor-textarea"
                value={openFile.content}
                onChange={(e) => setOpenFile({ ...openFile, content: e.target.value, modified: true })}
                spellCheck={false}
              />
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
          <button className="ctx-item" onClick={() => ctxAction('cut')}>Cut</button>
          <button className="ctx-item" onClick={() => ctxAction('copy')}>Copy</button>
          <button
            className={`ctx-item ${!clipboard || clipboard.isDir ? 'ctx-disabled' : ''}`}
            onClick={() => ctxAction('paste')}
            disabled={!clipboard || clipboard.isDir}
          >
            Paste
          </button>
          {!ctxMenu.isDir && (
            <button className="ctx-item" onClick={() => ctxAction('rename')}>Rename</button>
          )}
          {!ctxMenu.isDir && (
            <button className="ctx-item" onClick={() => ctxAction('saveas')}>Save As</button>
          )}
          <div className="ctx-divider" />
          <button className="ctx-item ctx-danger" onClick={() => ctxAction('delete')}>Delete</button>
        </div>
      )}
    </div>
  )
}

function replaceNode(nodes: FileNode[], targetPath: string, updated: FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updated
    if (node.children) return { ...node, children: replaceNode(node.children, targetPath, updated) }
    return node
  })
}
