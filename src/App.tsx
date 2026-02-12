import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Notebook, Page } from './types'
import { BookOpen, ChevronLeft, ChevronRight, Menu, Download, Trash2, PlusCircle, Check } from 'lucide-react'
import './styles/global.css'

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------
const TOTAL_PAGES = 100
const STORAGE_KEY = 'toshiyuki-notebook-v1'

// ----------------------------------------------------------------------
// Helper: Create a new blank notebook
// ----------------------------------------------------------------------
const createNewNotebook = (): Notebook => {
  const pages: Page[] = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
    pageNumber: i + 1,
    content: '',
    lastModified: new Date().toISOString(),
  }))

  return {
    id: uuidv4(),
    title: '新しいノート',
    createdAt: new Date().toISOString(),
    currentPage: 1,
    pages,
  }
}

function App() {
  // --------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------
  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [tempTitle, setTempTitle] = useState('')

  // --------------------------------------------------------------------
  // Effects: Load & Save
  // --------------------------------------------------------------------
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      try {
        setNotebook(JSON.parse(savedData))
      } catch (e) {
        console.error('Failed to parse notebook data', e)
        setNotebook(createNewNotebook())
      }
    } else {
      const newBook = createNewNotebook()
      setNotebook(newBook)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBook))
    }
  }, [])

  useEffect(() => {
    if (notebook) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notebook))
    }
  }, [notebook])

  // --------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > TOTAL_PAGES) return
    if (!notebook) return

    setNotebook({ ...notebook, currentPage: newPage })
    window.scrollTo(0, 0)
  }

  const handleContentChange = (content: string) => {
    if (!notebook) return

    const newPages = [...notebook.pages]
    const pageIndex = notebook.currentPage - 1
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      content,
      lastModified: new Date().toISOString(),
    }

    setNotebook({ ...notebook, pages: newPages })
  }

  const handleDownloadZip = async () => {
    if (!notebook) return

    const zip = new JSZip()
    let hasContent = false

    notebook.pages.forEach((page) => {
      if (page.content.trim()) {
        const date = new Date(page.lastModified)
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
        const filename = `${String(page.pageNumber).padStart(3, '0')}_${dateStr}.txt`
        zip.file(filename, page.content)
        hasContent = true
      }
    })

    if (!hasContent) {
      alert('内容が空のため、保存するものがありせん。')
      return
    }

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, `${notebook.title}.zip`)
    setIsMenuOpen(false)
  }

  const handleNewNotebook = () => {
    if (confirm('現在のノートを破棄して新しいノートを作成しますか？\n(未保存の内容は消えます。必要なら先にダウンロードしてください)')) {
      const newBook = createNewNotebook()
      setNotebook(newBook)
      setIsMenuOpen(false)
    }
  }
  
  const startRenaming = () => {
    if (!notebook) return
    setTempTitle(notebook.title)
    setIsRenaming(true)
  }

  const saveTitle = () => {
    if (!notebook) return
    setNotebook({ ...notebook, title: tempTitle })
    setIsRenaming(false)
  }

  if (!notebook) return <div className="loading">Loading...</div>

  const currentPageData = notebook.pages[notebook.currentPage - 1]
  const isLastPage = notebook.currentPage === TOTAL_PAGES

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
            <h1 onClick={startRenaming}>{notebook.title}</h1>
          )}
        </div>

        <div className="page-indicator">
          <span>{notebook.currentPage}</span>
          <span className="divider">/</span>
          <span>{TOTAL_PAGES}</span>
        </div>
      </header>

      {/* Menu Overlay */}
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-content" onClick={(e) => e.stopPropagation()}>
            <h2>メニュー</h2>
            <button onClick={handleDownloadZip}>
              <Download size={20} /> ZIPで保存 (バックアップ)
            </button>
            <button onClick={handleNewNotebook} className="danger">
              <PlusCircle size={20} /> 新しいノートを作成
            </button>
            <div className="menu-footer">
              <p>Ver 1.0.0 (Toshiyuki Note)</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Editor */}
      <main className="editor-area">
        <textarea
          value={currentPageData.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`Page ${notebook.currentPage}`}
          spellCheck={false}
        />
      </main>

      {/* Footer Navigation */}
      <footer className="footer">
        <button 
          className="nav-btn" 
          disabled={notebook.currentPage === 1}
          onClick={() => handlePageChange(notebook.currentPage - 1)}
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
              handlePageChange(notebook.currentPage + 1)
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