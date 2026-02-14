import React, { useState, useEffect } from 'react'
import { Menu, Search, Edit2, Check, X, Calendar } from 'lucide-react'

interface HeaderProps {
  title: string
  onToggleMenu: () => void
  onToggleSearch: () => void
  onToggleCalendar: () => void
  onRename: (newTitle: string) => void
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  onToggleMenu, 
  onToggleSearch, 
  onToggleCalendar,
  onRename 
}) => {
  const [isRenaming, setIsRenaming] = useState(false)
  const [tempTitle, setTempTitle] = useState(title)

  // Sync tempTitle when prop changes
  useEffect(() => {
    setTempTitle(title)
  }, [title])

  const startRenaming = () => {
    setTempTitle(title)
    setIsRenaming(true)
  }

  const saveTitle = () => {
    onRename(tempTitle)
    setIsRenaming(false)
  }

  return (
    <header className="header">
      <div className="header-left">
        {/* Placeholder if needed */}
      </div>

      <div className="title-container">
        {isRenaming ? (
          <div className="rename-box">
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              autoFocus
            />
            <button className="icon-btn-small" onClick={saveTitle}>
              <Check size={18} />
            </button>
            <button className="icon-btn-small" onClick={() => setIsRenaming(false)}>
              <X size={18} />
            </button>
          </div>
        ) : (
          <h1 onClick={startRenaming}>
            {title} <Edit2 size={14} style={{ marginLeft: 4, opacity: 0.5 }} />
          </h1>
        )}
      </div>

      <div className="header-right">
        <button className="icon-btn" onClick={onToggleMenu}>
          <Menu size={24} />
        </button>
      </div>
    </header>
  )
}