import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useSwipeable } from 'react-swipeable'
import { v4 as uuidv4 } from 'uuid'
import { useNotebooks } from './hooks/useNotebooks'
import type { Attachment } from './types'
import './styles/global.css'

// Components
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { NotebookMenu } from './components/NotebookMenu'
import { SearchOverlay } from './components/SearchOverlay'
import { ImagePreview } from './components/ImagePreview'
import { AttachmentList } from './components/AttachmentList'

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
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ notebookId: string; title: string; pageNumber: number; snippet: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Attachment State
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null)

  // Action: Page Change
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > TOTAL_PAGES) return
    if (!currentNotebook) return

    updateNotebook({ ...currentNotebook, currentPage: newPage })
    window.scrollTo(0, 0)
  }

  const handleNextPage = () => {
    if (!currentNotebook) return
    if (currentNotebook.currentPage === TOTAL_PAGES) {
      alert('最後のページです。メニューから保存して新しいノートを作成してください。')
    } else {
      handlePageChange(currentNotebook.currentPage + 1)
    }
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

  const handleRename = (newTitle: string) => {
    if (!currentNotebook) return
    updateNotebook({ ...currentNotebook, title: newTitle })
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
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!currentNotebook || !confirm('画像を削除しますか？\n(本文中の参照テキストは手動で消してください)')) return

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

  // Action: Create New
  const handleCreateNotebook = () => {
    createNotebook()
    setIsMenuOpen(false)
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
    onSwipedLeft: handleNextPage,
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
      <Header 
        title={currentNotebook.title}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onToggleSearch={() => setIsSearchOpen(true)}
        onRename={handleRename}
      />

      <NotebookMenu 
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        notebooks={notebooks}
        currentNotebook={currentNotebook}
        onLoadNotebook={loadNotebook}
        onDeleteNotebook={deleteNotebook}
        onCreateNotebook={handleCreateNotebook}
        onDownloadZip={handleDownloadZip}
      />

      <SearchOverlay 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onClear={() => setSearchQuery('')}
        isSearching={isSearching}
        results={searchResults}
        onJumpToResult={handleJumpToResult}
      />
      
      <ImagePreview 
        attachment={previewImage}
        onClose={() => setPreviewImage(null)}
        onDelete={handleDeleteAttachment}
      />

      {/* Main Editor */}
      <main className="editor-area" {...swipeHandlers}>
        <textarea
          ref={textareaRef}
          value={currentPageData.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`Page ${currentNotebook.currentPage}`}
          spellCheck={false}
        />
        
        <AttachmentList 
          attachments={attachments} 
          onPreview={setPreviewImage} 
        />
      </main>

      <Footer 
        currentPage={currentNotebook.currentPage}
        totalPages={TOTAL_PAGES}
        onPrevPage={() => handlePageChange(currentNotebook.currentPage - 1)}
        onNextPage={handleNextPage}
        onAddAttachment={handleAddAttachment}
        isNextDisabled={isLastPage && !currentPageData.content}
      />
    </div>
  )
}

export default App