import React, { useState, useEffect } from 'react'
import { Menu, Search, Check } from 'lucide-react'

interface HeaderProps {
  title: string
  onToggleMenu: () => void
  onToggleSearch: () => void
  onRename: (newTitle: string) => void
}

export const Header: React.FC<HeaderProps> = ({ title, onToggleMenu, onToggleSearch, onRename }) => {
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
      <button className="icon-btn" onClick={onToggleMenu}>
        <Menu size={24} />
      </button>
      
      <div className="title-container">
        {isRenaming ? (
          <div className="rename-box">
            <input 
              type="text" 
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              autoFocus
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            />
            <button className="icon-btn-small" onClick={saveTitle}><Check size={16} /></button>
          </div>
        ) : (
          <h1 onClick={startRenaming}>{title}</h1>
        )}
      </div>

      <button className="icon-btn" onClick={onToggleSearch}>
        <Search size={24} />
      </button>
    </header>
  )
}
