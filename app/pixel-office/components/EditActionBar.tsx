'use client'

import { useI18n } from '@/lib/i18n'

interface EditActionBarProps {
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onReset: () => void
}

const barBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: '12px',
  background: 'rgba(var(--accent2-rgb), 0.1)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer',
}

const disabledBtnStyle: React.CSSProperties = {
  ...barBtnStyle,
  opacity: 0.3,
  cursor: 'default',
}

export function EditActionBar({ isDirty, canUndo, canRedo, onUndo, onRedo, onSave, onReset }: EditActionBarProps) {
  const { t } = useI18n()

  if (!isDirty && !canUndo && !canRedo) return null

  return (
    <div className="pixel-office-edit-panel" style={{
      position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
      background: 'linear-gradient(165deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)), var(--card)',
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '4px 8px', display: 'flex', gap: 4,
      boxShadow: 'var(--shadow-soft)',
    }}>
      <button className="pixel-office-editor-btn" style={canUndo ? barBtnStyle : disabledBtnStyle} onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
        {t('pixelOffice.undo')}
      </button>
      <button className="pixel-office-editor-btn" style={canRedo ? barBtnStyle : disabledBtnStyle} onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
        {t('pixelOffice.redo')}
      </button>
      {isDirty && (
        <>
          <button className="pixel-office-editor-btn" style={{ ...barBtnStyle, background: 'rgba(var(--accent-rgb), 0.24)', border: '1px solid rgba(var(--accent-rgb), 0.55)' }} onClick={onSave}>
            {t('pixelOffice.save')}
          </button>
          <button className="pixel-office-editor-btn" style={barBtnStyle} onClick={onReset}>
            {t('pixelOffice.reset')}
          </button>
        </>
      )}
    </div>
  )
}
