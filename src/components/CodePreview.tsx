import { useState, useRef, useEffect, useCallback } from 'react'

interface CodePreviewProps {
  code: string
  lang: string
  onClose: () => void
}

export function CodePreview({ code, lang, onClose }: CodePreviewProps) {
  const [pos, setPos] = useState({ x: 100, y: 80 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 })
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const centerX = Math.max(100, (window.innerWidth - 600) / 2)
    const centerY = Math.max(80, (window.innerHeight - 400) / 2)
    setPos({ x: centerX, y: centerY })
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow!.document
    doc.open()
    if (lang === 'svg') {
      doc.write(code)
    } else if (lang === 'js' || lang === 'javascript') {
      doc.write(`<html><body><script>try { ${code} } catch(e) { document.body.innerHTML = '<pre style=color:red>'+e+'</pre>' }<\/script></body></html>`)
    } else {
      doc.write(code)
    }
    doc.close()
  }, [code, lang])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: pos.x,
      offsetY: pos.y,
    }
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setPos({
        x: Math.max(0, dragRef.current.offsetX + dx),
        y: Math.max(0, dragRef.current.offsetY + dy),
      })
    }
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  return (
    <div className="code-preview-overlay">
      <div
        className="code-preview-window"
        style={{ left: pos.x, top: pos.y }}
      >
        <div
          className="code-preview-titlebar"
          onMouseDown={handleMouseDown}
        >
          <span className="code-preview-title">Preview — {lang}</span>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>
        <div className="code-preview-body">
          <iframe ref={iframeRef} sandbox="allow-scripts" title="preview" />
        </div>
      </div>
    </div>
  )
}
