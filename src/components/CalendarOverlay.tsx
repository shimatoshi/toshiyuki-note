import React, { useState, useEffect } from 'react'
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  
  // 今表示している月のデータだけを計算して保持する
  const [monthlyActivity, setMonthlyActivity] = useState<Record<string, boolean>>({})
  const [dailyDetails, setDailyDetails] = useState<Record<string, Array<{ notebookId: string, title: string, pageNumber: number, time: string }>>>({})

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

  // 表示月が変わった時だけ、その月のデータを計算する
  useEffect(() => {
    if (!notebooks || notebooks.length === 0) return

    // 計算を非同期にして描画ブロックを防ぐ
    const timer = setTimeout(() => {
      const newActivity: Record<string, boolean> = {}
      const newDetails: Record<string, any[]> = {}
      
      // YYYY-MM 文字列 (計算対象の月)
      const targetMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`

      notebooks.forEach(nb => {
        if (!nb.pages) return
        
        nb.pages.forEach(pg => {
          // コンテンツか添付ファイルがあるページのみ
          const hasData = (pg.content && pg.content.trim().length > 0) || (pg.attachments && pg.attachments.length > 0)
          
          if (hasData && pg.lastModified) {
            try {
              // 文字列操作だけで月判定（Dateオブジェクト生成より高速）
              if (pg.lastModified.startsWith(targetMonthStr)) {
                const d = new Date(pg.lastModified)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                
                newActivity[key] = true
                
                if (!newDetails[key]) newDetails[key] = []
                newDetails[key].push({
                  notebookId: nb.id,
                  title: nb.title,
                  pageNumber: pg.pageNumber,
                  time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                })
              }
            } catch (e) {
              // Ignore
            }
          }
        })
      })

      setMonthlyActivity(newActivity)
      setDailyDetails(newDetails)
    }, 10) // 10ms delay to let UI render first

    return () => clearTimeout(timer)
  }, [year, month, notebooks])

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  const handleDateClick = (date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    if (monthlyActivity[key]) {
      setSelectedDate(key === selectedDate ? null : key)
    } else {
      setSelectedDate(null)
    }
  }

  const selectedActivities = selectedDate ? dailyDetails[selectedDate] : []

  return (
    <div className="overlay-container" onClick={onClose}>
      <div className="overlay-content calendar-content" onClick={e => e.stopPropagation()}>
        <div className="overlay-header">
          <h2>カレンダー</h2>
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
            
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            const hasActivity = monthlyActivity[key]
            const isToday = new Date().toDateString() === date.toDateString()
            const isSelected = selectedDate === key

            return (
              <div 
                key={idx} 
                className={`calendar-day ${hasActivity ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => handleDateClick(date)}
              >
                <span>{date.getDate()}</span>
                {hasActivity && <div className="dot"></div>}
              </div>
            )
          })}
        </div>
        
        {selectedDate && selectedActivities && selectedActivities.length > 0 && (
          <div className="activity-list">
            <h3>{selectedDate} の記録</h3>
            <div className="activity-items">
              {selectedActivities.map((item, idx) => (
                <div 
                  key={idx} 
                  className="activity-item"
                  onClick={() => {
                    onJumpToPage(item.notebookId, item.pageNumber)
                    onClose()
                  }}
                >
                  <FileText size={16} style={{ color: 'var(--accent-color)' }} />
                  <div className="activity-info">
                    <span className="activity-title">{item.title}</span>
                    <span className="activity-meta">Page {item.pageNumber} • {item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}