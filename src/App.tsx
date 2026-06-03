import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useSwipeable } from 'react-swipeable'
import { v4 as uuidv4 } from 'uuid'
import { useNotebooks } from './hooks/useNotebooks'
import { useSync } from './hooks/useSync'
import { reverseGeocode, formatAddress } from './utils/geocoding'
import { TOTAL_PAGES } from './types'
import type { Attachment, Page, Notebook } from './types'
import './styles/global.css'

// Components
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { NotebookMenu } from './components/NotebookMenu'
import { SearchOverlay } from './components/SearchOverlay'
import { ImagePreview } from './components/ImagePreview'
import { AttachmentList } from './components/AttachmentList'
import { CalendarOverlay } from './components/CalendarOverlay'

function App() {
  const {
    notebooks,
    currentNotebook,
    isLoading,
    saveError,
    retrySave,
    createNotebook,
    loadNotebook,
    deleteNotebook,
    updateNotebook,
    importNotebook,
    searchNotebooks,
    getMonthlyActivity
  } = useNotebooks()

  const {
    profile, isConnected, supabaseAvailable,
    handleLogin, handleLogout, syncNoteRecord,
  } = useSync()

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
    if (!currentNotebook) return
    if (newPage < 1 || newPage > currentNotebook.pages.length) return

    updateNotebook({ ...currentNotebook, currentPage: newPage })
    window.scrollTo(0, 0)
  }

  const handleNextPage = () => {
    if (!currentNotebook) return
    if (currentNotebook.currentPage >= currentNotebook.pages.length) {
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

    const updatedNotebook = { ...currentNotebook, pages: newPages }
    updateNotebook(updatedNotebook)

    // カレンダー連携: ログイン中ならnote_recordsを同期
    if (isConnected) {
      syncNoteRecord(updatedNotebook, pageIndex)
    }
  }

  const handleRename = (newTitle: string) => {
    if (!currentNotebook) return
    updateNotebook({ ...currentNotebook, title: newTitle }, true)
  }

  // 添付を現在ページに追加し、本文のカーソル位置に参照トークン (画像N) 等を挿入する。
  // ファイル選択・ペースト・ドロップなど複数の入口から共通利用する。
  const insertAttachment = async (att: Attachment) => {
    if (!currentNotebook) return

    const newPages = [...currentNotebook.pages]
    const pageIndex = currentNotebook.currentPage - 1
    const currentPage = newPages[pageIndex]

    const updatedAttachments = currentPage.attachments ? [...currentPage.attachments, att] : [att]
    const attachmentNumber = updatedAttachments.length

    const tagLabel = att.type === 'image' ? '画像' : att.type === 'location' ? '現在地' : 'ファイル'
    const textToInsert = ` (${tagLabel}${attachmentNumber}) `

    let newContent = currentPage.content
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      newContent = newContent.substring(0, start) + textToInsert + newContent.substring(end)
    } else {
      newContent += `\n${textToInsert}`
    }

    newPages[pageIndex] = {
      ...currentPage,
      content: newContent,
      attachments: updatedAttachments,
      lastModified: new Date().toISOString(),
    }

    await updateNotebook({ ...currentNotebook, pages: newPages })
  }

  // Action: Add Attachment (file picker)
  const handleAddAttachment = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    if (!currentNotebook || !e.target.files || e.target.files.length === 0) return

    const file = e.target.files[0]
    await insertAttachment({
      id: uuidv4(),
      type,
      data: file, // Store Blob directly
      name: file.name,
      mimeType: file.type,
      createdAt: new Date().toISOString(),
    })

    // 同じファイルを連続で選び直せるよう input をリセット
    e.target.value = ''
  }

  // 本文への画像ペースト対応。クリップボードに画像があれば添付として取り込み、
  // 参照トークンを挿入する。画像が無ければ通常のテキストペーストに委ねる。
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!currentNotebook) return
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          await insertAttachment({
            id: uuidv4(),
            type: 'image',
            data: file,
            name: `pasted-${Date.now()}.${ext}`,
            mimeType: item.type,
            createdAt: new Date().toISOString(),
          })
        }
        return
      }
    }
    // 画像でなければ何もしない（ブラウザ既定のテキストペーストが走る）
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
        let msg = '位置情報の取得に失敗しました。'
        if (error.code === 1) msg = '位置情報の利用が許可されていません。ブラウザの設定を確認してください。'
        if (error.code === 2) msg = '位置情報が取得できませんでした（電波状況などを確認してください）。'
        if (error.code === 3) msg = '位置情報の取得がタイムアウトしました。'
        alert(msg)
      },
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 300000 }
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

    await updateNotebook({ ...currentNotebook, pages: newPages }, true)
    setPreviewImage(null)
  }

  // Action: Download (with notebook.json manifest)
  const handleDownloadZip = async () => {
    if (!currentNotebook) return

    const zip = new JSZip()
    let hasContent = false

    // マニフェスト用: 添付ファイルのパスマッピング
    const attachmentFiles: Record<string, string> = {} // attachmentId -> zipPath

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
            const filepath = `attachments/${String(page.pageNumber).padStart(3, '0')}_${dateStr}_${idx + 1}.${ext}`
            zip.file(filepath, att.data)
            attachmentFiles[att.id] = filepath
            hasContent = true
          } else if (att.type === 'file' && att.data instanceof Blob) {
            const filepath = `attachments/${att.id}_${att.name || 'file'}`
            zip.file(filepath, att.data)
            attachmentFiles[att.id] = filepath
            hasContent = true
          }
        })
      }
    })

    if (!hasContent) {
      alert('内容が空のため、保存するものがありません。')
      return
    }

    // マニフェスト: ノート構造を保存（Blobは除外、パス参照に置換）
    const manifest = {
      version: 1,
      title: currentNotebook.title,
      createdAt: currentNotebook.createdAt,
      backgroundUri: currentNotebook.backgroundUri,
      showLines: currentNotebook.showLines,
      pages: currentNotebook.pages.map(page => ({
        pageNumber: page.pageNumber,
        content: page.content,
        lastModified: page.lastModified,
        attachments: page.attachments?.map(att => ({
          id: att.id,
          type: att.type,
          name: att.name,
          mimeType: att.mimeType,
          createdAt: att.createdAt,
          // locationデータはそのまま、ファイルはパス参照
          data: att.type === 'location' ? att.data : undefined,
          filePath: attachmentFiles[att.id] || undefined,
        }))
      }))
    }
    zip.file('notebook.json', JSON.stringify(manifest, null, 2))

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, `${currentNotebook.title}.zip`)
    setIsMenuOpen(false)
  }

  // Action: Import ZIP
  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]

    try {
      const zip = await JSZip.loadAsync(file)
      const manifestFile = zip.file('notebook.json')

      if (!manifestFile) {
        alert('このZIPにはnotebook.jsonが含まれていません。\nToshiyuki Noteからエクスポートしたファイルを使用してください。')
        return
      }

      const manifestStr = await manifestFile.async('string')
      const manifest = JSON.parse(manifestStr)

      // 新しいNotebookを構築
      const now = new Date().toISOString()
      const newPages: Page[] = []

      for (const pageDef of manifest.pages) {
        const attachments: Attachment[] = []

        if (pageDef.attachments) {
          for (const attDef of pageDef.attachments) {
            if (attDef.type === 'location') {
              // locationは元データをそのまま復元
              attachments.push({
                id: uuidv4(),
                type: 'location',
                data: attDef.data,
                name: attDef.name,
                createdAt: attDef.createdAt || now,
              })
            } else if (attDef.filePath) {
              // ファイル/画像はZIPから読み込み
              const zipEntry = zip.file(attDef.filePath)
              if (zipEntry) {
                const blob = await zipEntry.async('blob')
                attachments.push({
                  id: uuidv4(),
                  type: attDef.type,
                  data: blob,
                  name: attDef.name,
                  mimeType: attDef.mimeType,
                  createdAt: attDef.createdAt || now,
                })
              }
            }
          }
        }

        newPages.push({
          pageNumber: pageDef.pageNumber,
          content: pageDef.content || '',
          lastModified: pageDef.lastModified || now,
          attachments: attachments.length > 0 ? attachments : undefined,
        })
      }

      // 足りないページを補完（50ページに満たない場合）
      while (newPages.length < TOTAL_PAGES) {
        newPages.push({
          pageNumber: newPages.length + 1,
          content: '',
          lastModified: now,
        })
      }

      const importedNotebook: Notebook = {
        id: uuidv4(),
        title: manifest.title || file.name.replace(/\.zip$/i, ''),
        createdAt: manifest.createdAt || now,
        currentPage: 1,
        pages: newPages,
        backgroundUri: manifest.backgroundUri,
        showLines: manifest.showLines,
      }

      await importNotebook(importedNotebook)
      setIsMenuOpen(false)
      alert(`「${importedNotebook.title}」をインポートしました。`)
    } catch (err) {
      console.error('Import failed:', err)
      alert('ZIPの読み込みに失敗しました。ファイルが破損している可能性があります。')
    }
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

  const handleOpenCalendar = () => {
    setIsCalendarOpen(true)
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
  const attachments = currentPageData.attachments || []

  return (
    <div className="app-container">
      <Header
        title={currentNotebook.title}
        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
        onRename={handleRename}
      />

      {saveError && (
        <div className="save-error-banner" role="alert">
          <span>⚠️ 保存に失敗しました。端末の空き容量を確認してください。</span>
          <button onClick={() => retrySave()}>再試行</button>
        </div>
      )}

      <NotebookMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        notebooks={notebooks}
        currentNotebook={currentNotebook}
        onLoadNotebook={loadNotebook}
        onDeleteNotebook={deleteNotebook}
        onCreateNotebook={handleCreateNotebook}
        onDownloadZip={handleDownloadZip}
        onImportZip={handleImportZip}
        onUpdateNotebook={updateNotebook}
        sync={{
          isConnected,
          profileName: profile?.display_name ?? null,
          supabaseAvailable,
          onLogin: handleLogin,
          onLogout: handleLogout,
        }}
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
        fetchMonthlyData={getMonthlyActivity}
        onJumpToPage={handleCalendarJump}
      />

      <ImagePreview 
        attachment={previewImage}
        onClose={() => setPreviewImage(null)}
        onDelete={handleDeleteAttachment}
      />

      {/* Main Editor */}
      <main className="editor-area" {...swipeHandlers}>
        {currentNotebook.backgroundUri && (
          <img src={currentNotebook.backgroundUri} alt="" className="watermark-layer" />
        )}
        <textarea
          ref={textareaRef}
          value={currentPageData.content}
          onChange={(e) => handleContentChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={`Page ${currentNotebook.currentPage}`}
          spellCheck={false}
          className={currentNotebook.showLines ? 'ruled' : ''}
        />
        
        <AttachmentList 
          attachments={attachments} 
          onPreview={setPreviewImage} 
        />
      </main>

      <Footer
        currentPage={currentNotebook.currentPage}
        totalPages={currentNotebook.pages.length}
        onAddAttachment={handleAddAttachment}
        onAddTimestamp={handleAddTimestamp}
        onAddLocation={handleAddLocation}
        onToggleSearch={() => setIsSearchOpen(true)}
        onToggleCalendar={handleOpenCalendar}
      />
    </div>
  )
}

export default App