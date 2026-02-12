import React, { useState, useMemo, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import type { Notebook } from '../types'

interface CalendarOverlayProps {
  isOpen: boolean
  onClose: () => void
  fetchNotebooks: () => Promise<Notebook[]>
  onJumpToPage: (notebookId: string, pageNumber: number) => void
}

export const CalendarOverlay: React.FC<CalendarOverlayProps> = ({ 
  isOpen, 
  onClose, 
  fetchNotebooks,
  onJumpToPage
}) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [allNotebooks, setAllNotebooks] = useState<Notebook[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      fetchNotebooks().then(data => {
        setAllNotebooks(data)
        setIsLoading(false)
      })
    }
  }, [isOpen, fetchNotebooks])

  if (!isOpen) return null

  // Helper to format YYYY-MM-DD
  const formatDateKey = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Aggregate data: map date string to list of { notebook, page }
  const activityMap = useMemo(() => {
    const map: Record<string, Array<{ notebook: Notebook, pageNumber: number, time: string }>> = {}

    allNotebooks.forEach(notebook => {
      notebook.pages.forEach(page => {
        const hasContent = page.content.trim().length > 0 || (page.attachments && page.attachments.length > 0)
        
        if (hasContent && page.lastModified) {
          const date = new Date(page.lastModified)
          const key = formatDateKey(date)
          
          if (!map[key]) map[key] = []
          map[key].push({
            notebook,
            pageNumber: page.pageNumber,
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          })
        }
      })
    })
    return map
  }, [allNotebooks])

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
    setSelectedDate(null)
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  const handleDateClick = (date: Date) => {
    const key = formatDateKey(date)
    if (activityMap[key]) {
      setSelectedDate(key === selectedDate ? null : key)
    } else {
      setSelectedDate(null)
    }
  }

  const selectedActivities = selectedDate ? activityMap[selectedDate] : []

  return (
    <div className="overlay-container" onClick={onClose}>
      <div className="overlay-content calendar-content" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h2>カレンダー</h2>
          <button className="icon-btn" onClick={onClose}><X size={24} /></button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>読み込み中...</div>
        ) : (
          <>
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
                
                const dateKey = formatDateKey(date)
                const hasActivity = !!activityMap[dateKey]
                const isSelected = selectedDate === dateKey
                const isToday = formatDateKey(new Date()) === dateKey

                return (
                  <div 
                    key={dateKey} 
                    className={`calendar-day ${hasActivity ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => handleDateClick(date)}
                  >
                    <span>{date.getDate()}</span>
                    {hasActivity && <div className="dot"></div>}
                  </div>
                )
              })}
            </div>

            {selectedDate && selectedActivities.length > 0 && (
              <div className="activity-list">
                <h3>{selectedDate} の記録</h3>
                <div className="activity-items">
                  {selectedActivities.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="activity-item"
                      onClick={() => {
                        onJumpToPage(item.notebook.id, item.pageNumber)
                        onClose()
                      }}
                    >
                      <FileText size={16} style={{ color: 'var(--accent-color)' }} />
                      <div className="activity-info">
                        <span className="activity-title">{item.notebook.title}</span>
                        <span className="activity-meta">Page {item.pageNumber} • {item.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}