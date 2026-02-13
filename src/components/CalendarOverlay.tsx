import React, { useState, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import type { Notebook } from '../types'

interface CalendarOverlayProps {
  isOpen: boolean
  onClose: () => void
  notebooks: Notebook[]
  onJumpToPage: (notebookId: string, pageNumber: number) => void
}

export const CalendarOverlay: React.FC<CalendarOverlayProps> = ({ 
  isOpen, 
  onClose, 
  notebooks,
  onJumpToPage
}) => {
  if (!isOpen) return null

  return (
    <div className="overlay-container" onClick={onClose}>
      <div className="overlay-content calendar-content" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h2>カレンダー（調整中）</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>
        
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>データ取得には成功しています。</p>
          <p>ノート数: {notebooks.length}冊</p>
        </div>
      </div>
    </div>
  )
}
