import React, { useRef } from 'react'
import { FileText, Trash2, Download, PlusCircle, Image as ImageIcon, Type } from 'lucide-react'
import type { NotebookMetadata, Notebook } from '../types'

interface NotebookMenuProps {
  isOpen: boolean
  onClose: () => void
  notebooks: NotebookMetadata[]
  currentNotebook: Notebook | null
  onLoadNotebook: (id: string) => void
  onDeleteNotebook: (id: string) => void
  onCreateNotebook: () => void
  onDownloadZip: () => void
  onUpdateNotebook: (notebook: Notebook) => void
}

export const NotebookMenu: React.FC<NotebookMenuProps> = ({
  isOpen,
  onClose,
  notebooks,
  currentNotebook,
  onLoadNotebook,
  onDeleteNotebook,
  onCreateNotebook,
  onDownloadZip,
  onUpdateNotebook
}) => {
  const bgInputRef = useRef<HTMLInputElement>(null)
  
  if (!isOpen) return null

  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentNotebook || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = () => {
      onUpdateNotebook({ ...currentNotebook, backgroundUri: reader.result as string }, true)
    }
    reader.readAsDataURL(file)
  }

  const toggleLines = () => {
    if (!currentNotebook) return
    onUpdateNotebook({ ...currentNotebook, showLines: !currentNotebook.showLines }, true)
  }

  const clearBg = () => {
    if (!currentNotebook) return
    onUpdateNotebook({ ...currentNotebook, backgroundUri: undefined }, true)
  }

  return (
    <div className="menu-overlay" onClick={onClose}>
      <div className="menu-content" onClick={(e) => e.stopPropagation()}>
        <h2>メニュー</h2>
        
        <div className="notebook-list-container">
          <h3>ノート一覧</h3>
          <ul className="notebook-list">
            {notebooks.map(nb => (
              <li key={nb.id} className={currentNotebook && nb.id === currentNotebook.id ? 'active' : ''}>
                <div className="notebook-info" onClick={() => {
                  onLoadNotebook(nb.id)
                  onClose()
                }}>
                  <FileText size={16} />
                  <span className="notebook-title">{nb.title}</span>
                </div>
                {notebooks.length > 1 && (
                  <button className="delete-btn" onClick={(e) => {
                    e.stopPropagation()
                    onDeleteNotebook(nb.id)
                  }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="menu-actions">
          <button onClick={onCreateNotebook} className="action-btn">
            <PlusCircle size={20} /> 新しいノートを作成
          </button>
          
          <button onClick={toggleLines} className="action-btn">
            <Type size={20} /> 罫線: {currentNotebook?.showLines ? 'ON' : 'OFF'}
          </button>
          
          <button onClick={() => bgInputRef.current?.click()} className="action-btn">
            <ImageIcon size={20} /> 背景画像を設定
          </button>
          
          {currentNotebook?.backgroundUri && (
            <button onClick={clearBg} className="action-btn" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} /> 背景を削除
            </button>
          )}

          <button onClick={onDownloadZip} className="action-btn">
            <Download size={20} /> ZIPで保存
          </button>
          
          <input 
            type="file" 
            ref={bgInputRef} 
            onChange={handleBgChange} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
        </div>
        
        <div className="menu-footer">
          <p>Toshiyuki Note v1.3.0 (Theming)</p>
          <p>&copy; 2026 Shimatoshi</p>
        </div>
      </div>
    </div>
  )
}