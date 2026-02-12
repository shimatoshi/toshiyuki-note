import React from 'react'
import { FileText, Trash2, Download, PlusCircle } from 'lucide-react'
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
}

export const NotebookMenu: React.FC<NotebookMenuProps> = ({
  isOpen,
  onClose,
  notebooks,
  currentNotebook,
  onLoadNotebook,
  onDeleteNotebook,
  onCreateNotebook,
  onDownloadZip
}) => {
  if (!isOpen) return null

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
          <button onClick={onDownloadZip} className="action-btn">
            <Download size={20} /> ZIPで保存
          </button>
        </div>
        
      <div className="menu-footer">
        <p>Toshiyuki Note v1.2.0 (Calendar Fix)</p>
        <p>&copy; 2026 Shimatoshi</p>
      </div>
    </div>
  )
}
