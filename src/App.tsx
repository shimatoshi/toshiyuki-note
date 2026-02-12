import { useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useSwipeable } from 'react-swipeable'
import { useNotebooks } from './hooks/useNotebooks'
import { ChevronLeft, ChevronRight, Menu, Download, Trash2, PlusCircle, Check, FileText } from 'lucide-react'
import './styles/global.css'

const TOTAL_PAGES = 100

function App() {
  const { 
    notebooks, 
    currentNotebook, 
    isLoading, 
    createNotebook, 
    loadNotebook, 
    deleteNotebook,
    updateNotebook 
  } = useNotebooks()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [tempTitle, setTempTitle] = useState('')

  // Action: Page Change
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > TOTAL_PAGES) return
    if (!currentNotebook) return

    updateNotebook({ ...currentNotebook, currentPage: newPage })
    window.scrollTo(0, 0)
  }

  // Action: Content Change
  const handleContentChange = (content: string) => {
    if (!currentNotebook) return

    const newPages = [...currentNotebook.pages]
    const pageIndex = currentNotebook.currentPage - 1
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      content,
      lastModified: new Date().toISOString(),
    }

    updateNotebook({ ...currentNotebook, pages: newPages })
  }

  // Action: Download
  const handleDownloadZip = async () => {
    if (!currentNotebook) return

    const zip = new JSZip()
    let hasContent = false

    currentNotebook.pages.forEach((page) => {
      if (page.content.trim()) {
        const date = new Date(page.lastModified)
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
        const filename = `${String(page.pageNumber).padStart(3, '0')}_${dateStr}.txt`
        zip.file(filename, page.content)
        hasContent = true
      }
    })

    if (!hasContent) {
      alert('内容が空のため、保存するものがありません。')
      return
    }

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, `${currentNotebook.title}.zip`)
    setIsMenuOpen(false)
  }

  // Action: Create New
  const handleCreateNotebook = () => {
    createNotebook()
    setIsMenuOpen(false)
  }
  
  // Action: Rename
  const startRenaming = () => {
    if (!currentNotebook) return
    setTempTitle(currentNotebook.title)
    setIsRenaming(true)
  }

  const saveTitle = () => {
    if (!currentNotebook) return
    updateNotebook({ ...currentNotebook, title: tempTitle })
    setIsRenaming(false)
  }

  // Swipe Handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (currentNotebook && currentNotebook.currentPage < TOTAL_PAGES) {
         handlePageChange(currentNotebook.currentPage + 1)
      } else if (currentNotebook && currentNotebook.currentPage === TOTAL_PAGES) {
         alert('最後のページです。メニューから保存して新しいノートを作成してください。')
      }
    },
    onSwipedRight: () => {
      if (currentNotebook && currentNotebook.currentPage > 1) {
        handlePageChange(currentNotebook.currentPage - 1)
      }
    },
    preventScrollOnSwipe: true,
    trackMouse: false
  })

  if (isLoading || !currentNotebook) return <div className="loading">Loading...</div>

  const currentPageData = currentNotebook.pages[currentNotebook.currentPage - 1]
  const isLastPage = currentNotebook.currentPage === TOTAL_PAGES

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <button className="icon-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
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
            <h1 onClick={startRenaming}>{currentNotebook.title}</h1>
          )}
        </div>

        <div className="page-indicator">
          <span>{currentNotebook.currentPage}</span>
          <span className="divider">/</span>
          <span>{TOTAL_PAGES}</span>
        </div>
      </header>

      {/* Menu Overlay */}
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-content" onClick={(e) => e.stopPropagation()}>
            <h2>メニュー</h2>
            
            <div className="notebook-list-container">
              <h3>ノート一覧</h3>
              <ul className="notebook-list">
                {notebooks.map(nb => (
                  <li key={nb.id} className={nb.id === currentNotebook.id ? 'active' : ''}>
                    <div className="notebook-info" onClick={() => {
                      loadNotebook(nb.id)
                      setIsMenuOpen(false)
                    }}>
                      <FileText size={16} />
                      <span className="notebook-title">{nb.title}</span>
                    </div>
                    {notebooks.length > 1 && (
                      <button className="delete-btn" onClick={(e) => {
                        e.stopPropagation()
                        deleteNotebook(nb.id)
                      }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="menu-actions">
              <button onClick={handleCreateNotebook} className="action-btn">
                <PlusCircle size={20} /> 新しいノートを作成
              </button>
              <button onClick={handleDownloadZip} className="action-btn">
                <Download size={20} /> ZIPで保存
              </button>
            </div>
            
            <div className="menu-footer">
              <p>Ver 1.1.0 (Multiple Notebooks)</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Editor */}
      <main className="editor-area" {...swipeHandlers}>
        <textarea
          value={currentPageData.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`Page ${currentNotebook.currentPage}`}
          spellCheck={false}
        />
      </main>

      {/* Footer Navigation */}
      <footer className="footer">
        <button 
          className="nav-btn" 
          disabled={currentNotebook.currentPage === 1}
          onClick={() => handlePageChange(currentNotebook.currentPage - 1)}
        >
          <ChevronLeft size={24} />
          <span>前へ</span>
        </button>
        
        <button 
          className="nav-btn"
          disabled={isLastPage && !currentPageData.content} 
          onClick={() => {
            if (isLastPage) {
              alert('最後のページです。メニューから保存して新しいノートを作成してください。')
            } else {
              handlePageChange(currentNotebook.currentPage + 1)
            }
          }}
        >
          <span>次へ</span>
          <ChevronRight size={24} />
        </button>
      </footer>
    </div>
  )
}

export default App
