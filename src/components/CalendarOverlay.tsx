import React, { useState } from 'react'
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
  const [currentDate, setCurrentDate] = useState(new Date())
  
  if (!isOpen) return null

  // Calendar Logic
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDayOfWeek = firstDayOfMonth.getDay()

  const days = []
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  return (
    <div className="overlay-container" onClick={onClose}>
      <div className="overlay-content calendar-content" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h2>カレンダー（シンプル版）</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="calendar-controls">
          <button className="icon-btn" onClick={handlePrevMonth}><ChevronLeft /></button>
          <span>{year}年 {month + 1}月</span>
          <button className="icon-btn" onClick={handleNextMonth}><ChevronRight /></button>
        </div>

        <div className="calendar-grid-header">
          <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
        </div>

        <div className="calendar-grid">
          {days.map((date, idx) => {
            if (!date) return <div key={`empty-${idx}`} className="calendar-day empty"></div>
            
            const isToday = new Date().toDateString() === date.toDateString()

            return (
              <div 
                key={idx} 
                className={`calendar-day ${isToday ? 'today' : ''}`}
              >
                <span>{date.getDate()}</span>
              </div>
            )
          })}
        </div>
        
        <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.8em', color: '#888' }}>
          ※現在、詳細データ表示は無効化しています
        </div>
      </div>
    </div>
  )
}