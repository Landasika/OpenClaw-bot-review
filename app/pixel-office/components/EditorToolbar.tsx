'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { EditTool } from '@/lib/pixel-office/types'
import type { TileType as TileTypeVal, FloorColor } from '@/lib/pixel-office/types'
import { getCatalogByCategory, getActiveCategories } from '@/lib/pixel-office/layout/furnitureCatalog'
import type { FurnitureCategory } from '@/lib/pixel-office/layout/furnitureCatalog'
import { getCachedSprite } from '@/lib/pixel-office/sprites/spriteCache'
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '@/lib/pixel-office/floorTiles'

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '12px',
  background: 'rgba(var(--accent2-rgb), 0.1)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'rgba(var(--accent-rgb), 0.2)',
  color: 'var(--text)',
  border: '1px solid rgba(var(--accent-rgb), 0.55)',
}

const tabStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '11px',
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid transparent',
  borderRadius: 8,
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(var(--accent-rgb), 0.14)',
  color: 'var(--text)',
  border: '1px solid rgba(var(--accent-rgb), 0.45)',
}

function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displaySize = 32
  const tileZoom = 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = displaySize
    canvas.height = displaySize
    ctx.imageSmoothingEnabled = false
    if (!hasFloorSprites()) {
      ctx.fillStyle = '#444'
      ctx.fillRect(0, 0, displaySize, displaySize)
      return
    }
    const sprite = getColorizedFloorSprite(patternIndex, color)
    const cached = getCachedSprite(sprite, tileZoom)
    ctx.drawImage(cached, 0, 0)
  }, [patternIndex, color])

  return (
    <button className="pixel-office-editor-btn" onClick={onClick} title={`Floor ${patternIndex}`} style={{
      width: displaySize, height: displaySize, padding: 0,
      border: selected ? '1px solid rgba(var(--accent-rgb), 0.7)' : '1px solid var(--border)',
      borderRadius: 8, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, background: 'var(--card-soft)',
    }}>
      <canvas ref={canvasRef} style={{ width: displaySize, height: displaySize, display: 'block' }} />
    </button>
  )
}

function ColorSlider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: 16, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 12, accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: 32, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  floorColor: FloorColor
  wallColor: FloorColor
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
}

export function EditorToolbar({
  activeTool, selectedTileType, selectedFurnitureType,
  selectedFurnitureUid, selectedFurnitureColor,
  floorColor, wallColor,
  onToolChange, onTileTypeChange, onFloorColorChange, onWallColorChange,
  onSelectedFurnitureColorChange, onFurnitureTypeChange,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks')
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  const categoryItems = getCatalogByCategory(activeCategory)
  const patternCount = getFloorPatternCount()
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1)
  const thumbSize = 36

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK

  return (
    <div className="pixel-office-edit-panel" style={{
      position: 'absolute', bottom: 12, left: 10, zIndex: 50,
      background: 'linear-gradient(165deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)), var(--card)',
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '6px 8px', display: 'flex', flexDirection: 'column-reverse', gap: 6,
      boxShadow: 'var(--shadow-soft)', maxWidth: 'calc(100vw - 20px)',
    }}>
      {/* Tool row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="pixel-office-editor-btn" style={isFloorActive ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.TILE_PAINT)} title="Paint floor tiles">Floor</button>
        <button className="pixel-office-editor-btn" style={isWallActive ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.WALL_PAINT)} title="Paint walls">Wall</button>
        <button className="pixel-office-editor-btn" style={isEraseActive ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.ERASE)} title="Erase tiles">Erase</button>
        <button className="pixel-office-editor-btn" style={isFurnitureActive ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.FURNITURE_PLACE)} title="Place furniture">Furniture</button>
      </div>

      {/* Floor sub-panel */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="pixel-office-editor-btn" style={showColor ? activeBtnStyle : btnStyle} onClick={() => setShowColor(v => !v)} title="Adjust floor color">Color</button>
            <button className="pixel-office-editor-btn" style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.EYEDROPPER)} title="Pick floor pattern + color">Pick</button>
          </div>
          {showColor && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <ColorSlider label="H" value={floorColor.h} min={0} max={360} onChange={v => handleColorChange('h', v)} />
              <ColorSlider label="S" value={floorColor.s} min={0} max={100} onChange={v => handleColorChange('s', v)} />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={v => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={v => handleColorChange('c', v)} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {floorPatterns.map(patIdx => (
              <FloorPatternPreview key={patIdx} patternIndex={patIdx} color={floorColor} selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)} />
            ))}
          </div>
        </div>
      )}

      {/* Wall sub-panel */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="pixel-office-editor-btn" style={showWallColor ? activeBtnStyle : btnStyle} onClick={() => setShowWallColor(v => !v)} title="Adjust wall color">Color</button>
          </div>
          {showWallColor && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <ColorSlider label="H" value={wallColor.h} min={0} max={360} onChange={v => handleWallColorChange('h', v)} />
              <ColorSlider label="S" value={wallColor.s} min={0} max={100} onChange={v => handleWallColorChange('s', v)} />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={v => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={v => handleWallColorChange('c', v)} />
            </div>
          )}
        </div>
      )}

      {/* Furniture sub-panel */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {getActiveCategories().map(cat => (
              <button className="pixel-office-editor-btn" key={cat.id} style={activeCategory === cat.id ? activeTabStyle : tabStyle} onClick={() => setActiveCategory(cat.id)}>{cat.label}</button>
            ))}
            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
            <button className="pixel-office-editor-btn" style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle} onClick={() => onToolChange(EditTool.FURNITURE_PICK)} title="Pick furniture type">Pick</button>
          </div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {categoryItems.map(entry => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button className="pixel-office-editor-btn" key={entry.type} onClick={() => onFurnitureTypeChange(entry.type)} title={entry.label} style={{
                  width: thumbSize, height: thumbSize, background: 'var(--card-soft)',
                  border: isSelected ? '1px solid rgba(var(--accent-rgb), 0.7)' : '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer', padding: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                }}>
                  <canvas ref={el => {
                    if (!el) return
                    const ctx = el.getContext('2d')
                    if (!ctx) return
                    const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                    el.width = thumbSize; el.height = thumbSize
                    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, thumbSize, thumbSize)
                    const dw = cached.width * scale; const dh = cached.height * scale
                    ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                  }} style={{ width: thumbSize, height: thumbSize }} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color panel */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="pixel-office-editor-btn" style={showFurnitureColor ? activeBtnStyle : btnStyle} onClick={() => setShowFurnitureColor(v => !v)} title="Adjust selected furniture color">Color</button>
            {selectedFurnitureColor && (
              <button className="pixel-office-editor-btn" style={{ ...btnStyle, fontSize: '11px', padding: '2px 6px' }} onClick={() => onSelectedFurnitureColorChange(null)} title="Remove color">Clear</button>
            )}
          </div>
          {showFurnitureColor && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={0} max={360} onChange={v => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={0} max={100} onChange={v => handleSelFurnColorChange('s', v)} />
                </>
              ) : (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={-180} max={180} onChange={v => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={-100} max={100} onChange={v => handleSelFurnColorChange('s', v)} />
                </>
              )}
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={v => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={v => handleSelFurnColorChange('c', v)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!effectiveColor.colorize}
                  onChange={e => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'var(--accent)' }} />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
