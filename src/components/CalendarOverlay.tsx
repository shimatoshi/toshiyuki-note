import React, { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react'

interface ActivityItem {
  date: string
  notebookId: string
  title: string
  pageNumber: number
  time: string
}

interface CalendarOverlayProps {
  isOpen: boolean
  onClose: () => void
  fetchMonthlyData: (year: number, month: number) => Promise<ActivityItem[]>
  onJumpToPage: (notebookId: string, pageNumber: number) => void
}

export const CalendarOverlay: React.FC<CalendarOverlayProps> = ({ 
  isOpen, 
  onClose,
  fetchMonthlyData,
  onJumpToPage
}) => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  
  const [monthlyActivity, setMonthlyActivity] = useState<Record<string, boolean>>({})
  const [dailyDetails, setDailyDetails] = useState<Record<string, ActivityItem[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsLoading(true)
    setError(null)
    
    fetchMonthlyData(year, month + 1)
      .then(items => {
        if (!isMounted) return
        if (!Array.isArray(items)) {
            setMonthlyActivity({})
            setDailyDetails({})
            return
        }

        const newActivity: Record<string, boolean> = {}
        const newDetails: Record<string, ActivityItem[]> = {}
        
        items.forEach(item => {
          if (!item || !item.date) return
          newActivity[item.date] = true
          if (!newDetails[item.date]) newDetails[item.date] = []
          newDetails[item.date].push(item)
        })
        
        setMonthlyActivity(newActivity)
        setDailyDetails(newDetails)
        setIsLoading(false)
      })
      .catch(err => {
        if (!isMounted) return
        console.error('Calendar Fetch Error:', err)
        setError('データの読み込みに失敗しました')
        setIsLoading(false)
      })

    return () => { isMounted = false }
  }, [year, month, isOpen, fetchMonthlyData])

  if (!isOpen) return null

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
    <div className="overlay-container" onClick={onClose} style={{ zIndex: 9999 }}>
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
        
        {error ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--danger-color)' }}>{error}</div>
        ) : isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>読み込み中...</div>
        ) : (
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
        )}
        
        {selectedDate && selectedActivities && selectedActivities.length > 0 && (
          <div className="activity-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
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
                  style={{ cursor: 'pointer' }}
                >
                  <FileText size={16} style={{ color: 'var(--accent-color)' }} />
                  <div className="activity-info">
                    <span className="activity-title">{item.title || '無題'}</span>
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