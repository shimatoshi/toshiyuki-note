import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useSwipeable } from 'react-swipeable'
import { v4 as uuidv4 } from 'uuid'
import { useNotebooks } from './hooks/useNotebooks'
import { reverseGeocode, formatAddress } from './utils/geocoding'
import type { Attachment } from './types'
import './styles/global.css'

// Components
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { NotebookMenu } from './components/NotebookMenu'
import { SearchOverlay } from './components/SearchOverlay'
import { ImagePreview } from './components/ImagePreview'
import { AttachmentList } from './components/AttachmentList'
import { CalendarOverlay } from './components/CalendarOverlay'

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
    searchNotebooks,
    getAllFullNotebooks
  } = useNotebooks()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  
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
  const handleAddAttachment = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    if (!currentNotebook || !e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    const newAttachment: Attachment = {
      id: uuidv4(),
      type: type,
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
      const tagLabel = type === 'image' ? '画像' : 'ファイル'
      const textToInsert = ` (${tagLabel}${attachmentNumber}) `
      newContent = newContent.substring(0, start) + textToInsert + newContent.substring(end)
    } else {
       const tagLabel = type === 'image' ? '画像' : 'ファイル'
       newContent += `\n(${tagLabel}${attachmentNumber})`
    }
    
    newPages[pageIndex] = {
      ...currentPage,
      content: newContent,
      attachments: updatedAttachments,
      lastModified: new Date().toISOString(),
    }

    await updateNotebook({ ...currentNotebook, pages: newPages })
  }

  const handleAddTimestamp = () => {
    if (!currentNotebook) return
    const now = new Date()
    const Y = now.getFullYear()
    const M = String(now.getMonth() + 1).padStart(2, '0')
    const D = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const timeStr = `[${Y}/${M}/${D} ${h}:${m}]`
    
    const newPages = [...currentNotebook.pages]
    const pageIndex = currentNotebook.currentPage - 1
    const currentPage = newPages[pageIndex]

    let newContent = currentPage.content
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      newContent = newContent.substring(0, start) + timeStr + newContent.substring(end)
    } else {
      newContent += timeStr
    }

    newPages[pageIndex] = {
      ...currentPage,
      content: newContent,
      lastModified: new Date().toISOString(),
    }

    updateNotebook({ ...currentNotebook, pages: newPages })
  }

  const handleAddLocation = () => {
    if (!currentNotebook) return
    if (!navigator.geolocation) {
      alert('この端末は位置情報に対応していません。')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords
        
        let addressStr = `Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        let addressData = null

        try {
          const addressInfo = await reverseGeocode(latitude, longitude)
          if (addressInfo) {
            const formatted = formatAddress(addressInfo)
            if (formatted) {
               addressStr = formatted
            }
            addressData = addressInfo
          }
        } catch (e) {
          console.error('Address lookup failed', e)
        }
        
        const newAttachment: Attachment = {
          id: uuidv4(),
          type: 'location',
          data: { latitude, longitude, accuracy, address: addressData },
          name: addressStr,
          createdAt: new Date().toISOString()
        }

        const newPages = [...currentNotebook.pages]
        const pageIndex = currentNotebook.currentPage - 1
        const currentPage = newPages[pageIndex]
        
        const updatedAttachments = currentPage.attachments ? [...currentPage.attachments, newAttachment] : [newAttachment]
        const attachmentNumber = updatedAttachments.length

        let newContent = currentPage.content
        const locationStr = ` (現在地${attachmentNumber}) `
        
        const textarea = textareaRef.current
        if (textarea) {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          newContent = newContent.substring(0, start) + locationStr + newContent.substring(end)
        } else {
          newContent += `\n${locationStr}`
        }

        newPages[pageIndex] = {
          ...currentPage,
          content: newContent,
          attachments: updatedAttachments,
          lastModified: new Date().toISOString(),
        }

        await updateNotebook({ ...currentNotebook, pages: newPages })
      },
      (error) => {
        console.error('Geolocation error', error)
        alert('位置情報の取得に失敗しました。')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
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

  const handleCalendarJump = (notebookId: string, pageNumber: number) => {
    if (currentNotebook && currentNotebook.id === notebookId) {
       handlePageChange(pageNumber)
    } else {
       loadNotebook(notebookId, pageNumber)
    }
    setIsCalendarOpen(false)
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
        onToggleCalendar={() => setIsCalendarOpen(true)}
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
      
      <CalendarOverlay 
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        fetchNotebooks={getAllFullNotebooks}
        onJumpToPage={handleCalendarJump}
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
        onAddTimestamp={handleAddTimestamp}
        onAddLocation={handleAddLocation}
        isNextDisabled={isLastPage && !currentPageData.content}
      />
    </div>
  )
}

export default App