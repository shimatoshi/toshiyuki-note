import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useSwipeable } from 'react-swipeable'
import { v4 as uuidv4 } from 'uuid'
import { useNotebooks } from './hooks/useNotebooks'
import type { Attachment } from './types'
import { ChevronLeft, ChevronRight, Menu, Download, Trash2, PlusCircle, Check, FileText, Search, X, Paperclip, MapPin } from 'lucide-react'
import './styles/global.css'

const TOTAL_PAGES = 50

function App() {
  const { 
    notebooks, 
    currentNotebook, 
    isLoading, 
    createNotebook, 
    loadNotebook, 
    deleteNotebook,
    updateNotebook,
    searchNotebooks
  } = useNotebooks()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ notebookId: string; title: string; pageNumber: number; snippet: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Attachment State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null)

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

  // Action: Add Attachment
  const handleAddAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentNotebook || !e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    const newAttachment: Attachment = {
      id: uuidv4(),
      type: 'image',
      data: file, // Store Blob directly
      name: file.name,
      mimeType: file.type,
      createdAt: new Date().toISOString()
    }

    const newPages = [...currentNotebook.pages]
    const pageIndex = currentNotebook.currentPage - 1
    const currentPage = newPages[pageIndex]
    
    const updatedAttachments = currentPage.attachments ? [...currentPage.attachments, newAttachment] : [newAttachment]
    const attachmentNumber = updatedAttachments.length

    // Insert text reference
    let newContent = currentPage.content
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      // Insert (画像N) with a space before if needed, or newline
      // Simple insertion:
      const textToInsert = ` (画像${attachmentNumber}) `
      newContent = newContent.substring(0, start) + textToInsert + newContent.substring(end)
    } else {
       newContent += `\n(画像${attachmentNumber})`
    }
    
    newPages[pageIndex] = {
      ...currentPage,
      content: newContent,
      attachments: updatedAttachments,
      lastModified: new Date().toISOString(),
    }

    await updateNotebook({ ...currentNotebook, pages: newPages })
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!currentNotebook || !confirm('画像を削除しますか?\n(本文中の参照テキストは手動で消してください)')) return

    const newPages = [...currentNotebook.pages]
    const pageIndex = currentNotebook.currentPage - 1
    const currentPage = newPages[pageIndex]
    
    if (!currentPage.attachments) return

    const updatedAttachments = currentPage.attachments.filter(a => a.id !== attachmentId)
    
    newPages[pageIndex] = {
      ...currentPage,
      attachments: updatedAttachments,
      lastModified: new Date().toISOString(),
    }

    await updateNotebook({ ...currentNotebook, pages: newPages })
    setPreviewImage(null)
  }

  // Helper to create object URL for display
  const getImageUrl = (data: Blob) => {
    return URL.createObjectURL(data)
  }

  // Action: Download
  const handleDownloadZip = async () => {
    if (!currentNotebook) return

    const zip = new JSZip()
    let hasContent = false

    currentNotebook.pages.forEach((page) => {
      // Text content
      if (page.content.trim()) {
        const date = new Date(page.lastModified)
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
        const filename = `${String(page.pageNumber).padStart(3, '0')}_${dateStr}.txt`
        zip.file(filename, page.content)
        hasContent = true
      }
      
      // Attachments
      if (page.attachments && page.attachments.length > 0) {
         page.attachments.forEach((att, idx) => {
           if (att.type === 'image' && att.data instanceof Blob) {
             const date = new Date(page.lastModified)
             const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
             const ext = att.name ? att.name.split('.').pop() : 'png'
             const filename = `images/${String(page.pageNumber).padStart(3, '0')}_${dateStr}_${idx + 1}.${ext}`
             zip.file(filename, att.data)
             hasContent = true
           }
         })
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

  // ... (Other handlers unchanged)
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

  // Action: Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    const results = await searchNotebooks(searchQuery)
    setSearchResults(results)
    setIsSearching(false)
  }

  const handleJumpToResult = (notebookId: string, pageNumber: number) => {
    if (currentNotebook && currentNotebook.id === notebookId) {
       handlePageChange(pageNumber)
    } else {
       loadNotebook(notebookId, pageNumber)
    }
    setIsSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
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
  const attachments = currentPageData.attachments || []

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

        <button className="icon-btn" onClick={() => setIsSearchOpen(true)}>
          <Search size={24} />
        </button>
      </header>

      {/* Menu & Search Overlay (Unchanged logic) */}
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
              <p>Ver 1.4.0 (Attachments Ref)</p>
            </div>
          </div>
        </div>
      )}

      {isSearchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <form onSubmit={handleSearch} className="search-bar">
              <Search size={20} className="search-icon" />
              <input 
                type="text" 
                placeholder="全ノート検索..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button type="button" className="clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={16} />
                </button>
              )}
            </form>
            <button className="close-btn" onClick={() => setIsSearchOpen(false)}>
              キャンセル
            </button>
          </div>
          
          <div className="search-results">
            {isSearching ? (
              <div className="searching-indicator">検索中...</div>
            ) : searchResults.length > 0 ? (
              <ul>
                {searchResults.map((result, idx) => (
                  <li key={`${result.notebookId}-${result.pageNumber}-${idx}`} onClick={() => handleJumpToResult(result.notebookId, result.pageNumber)}>
                    <div className="result-meta">
                      <span className="result-title">{result.title}</span>
                      <span className="result-page">P.{result.pageNumber}</span>
                    </div>
                    <div className="result-snippet">{result.snippet}</div>
                  </li>
                ))}
              </ul>
            ) : searchQuery && !isSearching ? (
               <div className="no-results">見つかりませんでした</div>
            ) : null}
          </div>
        </div>
      )}
      
      {/* Image Preview Overlay */}
      {previewImage && (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
             <img src={getImageUrl(previewImage.data as Blob)} alt="Preview" />
             <button className="preview-close" onClick={() => setPreviewImage(null)}><X size={24} /></button>
             <button className="preview-delete" onClick={() => handleDeleteAttachment(previewImage.id)}>
               <Trash2 size={24} /> 削除
             </button>
          </div>
        </div>
      )}

      {/* Main Editor */}
      <main className="editor-area" {...swipeHandlers}>
        <textarea
          ref={textareaRef}
          value={currentPageData.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`Page ${currentNotebook.currentPage}`}
          spellCheck={false}
        />
        
        {/* Attachments Area */}
        {attachments.length > 0 && (
          <div className="attachments-area">
            {attachments.map((att, idx) => (
              <div key={att.id} className="attachment-item" onClick={() => setPreviewImage(att)}>
                {att.type === 'image' && (
                  <>
                    <img src={getImageUrl(att.data as Blob)} alt="attachment" className="attachment-thumb" />
                    <span className="attachment-badge">{idx + 1}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer Navigation */}
      <footer className="footer">
        <div className="footer-left">
           <div className="page-indicator-footer">
             {currentNotebook.currentPage} / {TOTAL_PAGES}
           </div>
        </div>

        <div className="footer-center">
           <input 
             type="file" 
             ref={fileInputRef} 
             style={{ display: 'none' }} 
             accept="image/*"
             onChange={handleAddAttachment}
           />
           <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
             <Paperclip size={20} />
           </button>
           {/* Placeholder for Location */}
           {/* <button className="icon-btn disabled"><MapPin size={20} /></button> */}
        </div>

        <div className="nav-buttons">
          <button 
            className="nav-btn" 
            disabled={currentNotebook.currentPage === 1}
            onClick={() => handlePageChange(currentNotebook.currentPage - 1)}
          >
            <ChevronLeft size={24} />
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
            <ChevronRight size={24} />
          </button>
        </div>
      </footer>
    </div>
  )
}

export default App