import { useState, useEffect, useCallback, useRef } from 'react'
import { DraggableWindow } from './DraggableWindow'
import type { FileNode, OpenFile } from '../types'

interface FileExplorerProps {
  rootDir: string
  onClose: () => void
  onFileOpen?: (file: { path: string; name: string } | null) => void
  floating?: boolean
}

type CreateMode = 'none' | 'file' | 'folder'

const PREVIEW_EXTS = ['.html', '.htm', '.svg', '.js']

export function FileExplorer({ rootDir, onClose, onFileOpen, floating }: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([])
  const [openFile, setOpenFile] = useState<OpenFile | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedDir, setSelectedDir] = useState(rootDir)
  const [status, setStatus] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode>('none')
  const [createName, setCreateName] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

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
          nodes.push({
            name: info.name,
            path: info.path,
            isDirectory: info.isDirectory,
            expanded: false,
            children: [],
          })
        } catch { /* skip inaccessible entries */ }
      }
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return nodes
    } catch { return [] }
  }, [api])

  useEffect(() => {
    loadDir(rootDir).then((nodes) => {
      setTree(nodes)
      setSelectedDir(rootDir)
    })
  }, [rootDir, loadDir])

  useEffect(() => {
    if (createMode !== 'none') inputRef.current?.focus()
  }, [createMode])

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

  const toggleDir = useCallback(async (node: FileNode) => {
    if (!node.isDirectory) return
    setSelectedDir(node.path)
    const updated = { ...node, expanded: !node.expanded }
    if (!node.expanded && (!node.children || node.children.length === 0)) {
      updated.children = await loadDir(node.path)
    }
    setTree((prev) => replaceNode(prev, node.path, updated))
  }, [loadDir])

  const openFileContent = useCallback(async (node: FileNode) => {
    if (node.isDirectory || !api) return
    if (openFile?.path === node.path) return
    try {
      const content = await api.readFile(node.path)
      setOpenFile({ path: node.path, name: node.name, content, modified: false })
      setShowPreview(false)
      onFileOpen?.({ path: node.path, name: node.name })
    } catch {
      setStatus(`Error opening ${node.name}`)
    }
  }, [api, openFile, onFileOpen])

  // Single-click: select (highlight). Double-click: open.
  // The broken dblClickRef/setTimeout pattern is removed entirely.
  const handleNodeClick = useCallback((node: FileNode) => {
    if (node.isDirectory) {
      toggleDir(node)
    } else {
      setSelectedPath(node.path)
    }
  }, [toggleDir])

  const handleNodeDoubleClick = useCallback((node: FileNode) => {
    if (node.isDirectory) return
    openFileContent(node)
  }, [openFileContent])

  const saveFile = useCallback(async () => {
    if (!openFile || !api) return
    try {
      await api.writeFile(openFile.path, openFile.content)
      setOpenFile({ ...openFile, modified: false })
      setStatus('Saved')
    } catch {
      setStatus('Save failed')
    }
  }, [openFile, api])

  const closeFile = useCallback(() => {
    setOpenFile(null)
    setShowPreview(false)
    onFileOpen?.(null)
  }, [onFileOpen])

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

  const startCreate = (mode: CreateMode) => {
    setCreateMode(mode)
    setCreateName(mode === 'file' ? 'index.html' : 'new-folder')
  }

  const submitCreate = useCallback(async () => {
    if (!api || !selectedDir || !createName.trim()) return
    const name = createName.trim()
    const fullPath = `${selectedDir}\\${name}`
    setCreateMode('none')
    setCreateName('')
    try {
      if (createMode === 'file') {
        await api.createFile(fullPath, '')
        setOpenFile({ path: fullPath, name, content: '', modified: false })
        setStatus(`Created ${name}`)
      } else {
        await api.createDirectory(fullPath)
        setStatus(`Created ${name}`)
      }
      await refreshTree()
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : 'error'}`)
    }
  }, [api, selectedDir, createMode, createName, refreshTree])

  const cancelCreate = useCallback(() => {
    setCreateMode('none')
    setCreateName('')
  }, [])

  const deleteEntry = useCallback(async (nodePath: string) => {
    if (!api) return
    if (!confirm('Delete this entry?')) return
    try {
      await api.deleteEntry(nodePath)
      if (openFile?.path === nodePath) { setOpenFile(null); setShowPreview(false) }
      await refreshTree()
      setStatus('Deleted')
    } catch {
      setStatus('Failed to delete')
    }
  }, [api, openFile, refreshTree])

  const canPreview = openFile && PREVIEW_EXTS.some(ext => openFile.name.endsWith(ext))

  if (!api) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content explorer-panel" onClick={(e) => e.stopPropagation()}>
        <p style={{ padding: 20, color: 'var(--text-muted)' }}>File system access requires Electron.</p>
      </div>
    </div>
  )

  const renderNode = (node: FileNode, depth: number): JSX.Element => (
    <div key={node.path}>
      <div
        className={`explorer-node ${selectedPath === node.path ? 'explorer-node-selected' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => handleNodeClick(node)}
        onDoubleClick={() => handleNodeDoubleClick(node)}
      >
        <span className="explorer-icon">{node.isDirectory ? (node.expanded ? '📂' : '📁') : '📄'}</span>
        <span className="explorer-name">{node.name}</span>
        {!node.isDirectory && (
          <span className="explorer-delete" onClick={(e) => { e.stopPropagation(); deleteEntry(node.path) }}>×</span>
        )}
      </div>
      {node.isDirectory && node.expanded && node.children?.map((child) => renderNode(child, depth + 1))}
    </div>
  )

  const inner = (
    <div className="explorer-panel" style={floating ? { border: 'none', borderRadius: 0, height: '100%', width: '100%', maxWidth: 'none', flex: 1, display: 'flex' } : {}} onClick={(e) => e.stopPropagation()}>
      <div className="explorer-sidebar">
        <div className="explorer-toolbar">
          <span className="explorer-title">Files</span>
          <div className="explorer-actions">
            {createMode !== 'none' ? (
              <form onSubmit={(e) => { e.preventDefault(); submitCreate() }} className="create-form">
                <input
                  ref={inputRef}
                  className="create-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onBlur={cancelCreate}
                  placeholder={createMode === 'file' ? 'filename.ext' : 'folder-name'}
                />
              </form>
            ) : (
              <>
                <button className="btn btn-sm btn-secondary" onClick={() => startCreate('file')}>+ File</button>
                <button className="btn btn-sm btn-secondary" onClick={() => startCreate('folder')}>+ Dir</button>
              </>
            )}
            <button className="btn btn-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="explorer-tree">
          {tree.length === 0 && <div className="empty-state" style={{ padding: 20 }}><p>Empty directory</p></div>}
          {tree.map((node) => renderNode(node, 0))}
        </div>
        {status && <div className="explorer-status">{status}</div>}
      </div>

      <div className="explorer-editor">
        {openFile ? (
          <>
            <div className="explorer-editor-toolbar">
              <span className="explorer-editor-filename">{openFile.name}</span>
              <div className="explorer-editor-actions">
                {showPreview ? (
                  <button className="btn btn-sm btn-secondary" onClick={() => setShowPreview(false)} style={{ marginRight: 4 }}>← Back to Code</button>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => setShowPreview(true)} disabled={!canPreview} title={canPreview ? 'Preview page' : 'Preview only for .html .svg .js files'} style={{ marginRight: 4 }}>
                    Preview
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={saveFile} disabled={!openFile.modified}>
                  Save
                </button>
                <button className="btn btn-sm btn-secondary" onClick={closeFile} style={{ marginLeft: 4 }}>
                  Close
                </button>
              </div>
            </div>
            {showPreview && canPreview ? (
              <iframe ref={iframeRef} className="explorer-preview-iframe" sandbox="allow-scripts allow-same-origin" title="preview" onLoad={writePreview} />
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
          <div className="explorer-editor-empty">
            <p>Double-click a file to edit</p>
          </div>
        )}
      </div>
    </div>
  )

  if (floating) {
    return (
      <DraggableWindow title="File Explorer" initialWidth={760} initialHeight={480} onClose={onClose} dockZone="bottom-left">
        {inner}
      </DraggableWindow>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      {inner}
    </div>
  )
}

function replaceNode(nodes: FileNode[], targetPath: string, updated: FileNode): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return updated
    if (n.children) return { ...n, children: replaceNode(n.children, targetPath, updated) }
    return n
  })
}
