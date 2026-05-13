import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'

interface DraggableWindowProps {
  title: string
  initialWidth?: number
  initialHeight?: number
  children: ReactNode
  onClose: () => void
  dockZone?: 'bottom-left' | 'bottom-right' | 'top-right'
}

export function DraggableWindow({ title, initialWidth = 500, initialHeight = 300, children, onClose, dockZone }: DraggableWindowProps) {
  const [pos, setPos] = useState({ x: 100, y: 60 })
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight })
  const [docked, setDocked] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef({ sx: 0, sy: 0, ox: 0, oy: 0 })
  const resizeRef = useRef({ sx: 0, sy: 0, ow: 0, oh: 0 })
  const winRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cx = Math.max(60, (window.innerWidth - size.w) / 2)
    const cy = Math.max(40, (window.innerHeight - size.h) / 2)
    setPos({ x: cx, y: cy })
  }, [])

  useEffect(() => {
    if (!docked) return
    if (dockZone === 'bottom-left') setPos({ x: 8, y: window.innerHeight - size.h - 50 })
    else if (dockZone === 'bottom-right') setPos({ x: window.innerWidth - size.w - 8, y: window.innerHeight - size.h - 50 })
    else if (dockZone === 'top-right') setPos({ x: window.innerWidth - size.w - 8, y: 8 })
  }, [docked, dockZone, size])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (docked) return
    setDragging(true)
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
  }, [docked, pos])

  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setResizing(true)
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h }
  }, [size])

  useEffect(() => {
    if (!dragging && !resizing) return
    const handleMove = (e: MouseEvent) => {
      if (dragging) {
        setPos({
          x: Math.max(0, dragRef.current.ox + e.clientX - dragRef.current.sx),
          y: Math.max(0, dragRef.current.oy + e.clientY - dragRef.current.sy),
        })
      }
      if (resizing) {
        setSize({
          w: Math.max(200, resizeRef.current.ow + e.clientX - resizeRef.current.sx),
          h: Math.max(120, resizeRef.current.oh + e.clientY - resizeRef.current.sy),
        })
      }
    }
    const handleUp = () => { setDragging(false); setResizing(false) }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [dragging, resizing])

  return (
    <div
      ref={winRef}
      className={`float-window ${docked ? 'float-docked' : ''}`}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div className="float-titlebar" onMouseDown={handleMouseDown}>
        <span className="float-title">{title}</span>
        <div className="float-actions">
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setDocked(!docked)}
            title={docked ? 'Undock' : `Dock ${dockZone ? 'to ' + dockZone : ''}`}
            style={{ fontSize: '0.7rem', padding: '1px 6px' }}
          >
            {docked ? '◂' : '⊟'}
          </button>
          <button className="btn btn-close" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="float-body">
        {children}
      </div>
      <div className="float-resize-handle" onMouseDown={handleResizeDown} />
    </div>
  )
}
