import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Notebook, NotebookMetadata, Page } from '../types'
import { db } from '../db'

const TOTAL_PAGES = 50
// Old keys for migration
const LEGACY_METADATA_KEY = 'toshiyuki-notebooks-metadata'
const LEGACY_NOTEBOOK_PREFIX = 'toshiyuki-notebook-'
const LEGACY_SINGLE_NOTE_KEY = 'toshiyuki-notebook-v1'

const createNewNotebook = (title = '新しいノート'): Notebook => {
  const now = new Date().toISOString()
  const pages: Page[] = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
    pageNumber: i + 1,
    content: '',
    lastModified: now,
  }))

  return {
    id: uuidv4(),
    title,
    createdAt: now,
    currentPage: 1,
    pages,
  }
}

export const useNotebooks = () => {
  const [notebooks, setNotebooks] = useState<NotebookMetadata[]>([])
  const [currentNotebook, setCurrentNotebook] = useState<Notebook | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Migration Logic
  const migrateFromLocalStorage = async () => {
    console.log('Checking for legacy data...')
    
    // 1. Check for v1.1 multiple notebooks metadata
    const legacyMetaStr = localStorage.getItem(LEGACY_METADATA_KEY)
    if (legacyMetaStr) {
      try {
        const metas: NotebookMetadata[] = JSON.parse(legacyMetaStr)
        for (const meta of metas) {
          const notebookStr = localStorage.getItem(`${LEGACY_NOTEBOOK_PREFIX}${meta.id}`)
          if (notebookStr) {
            const notebook: Notebook = JSON.parse(notebookStr)
            await db.saveNotebook(notebook)
            localStorage.removeItem(`${LEGACY_NOTEBOOK_PREFIX}${meta.id}`)
          }
        }
        localStorage.removeItem(LEGACY_METADATA_KEY)
        console.log('Migrated multiple notebooks to IndexedDB')
      } catch (e) {
        console.error('Migration failed (multiple)', e)
      }
    }

    // 2. Check for v1.0 single notebook
    const legacySingleStr = localStorage.getItem(LEGACY_SINGLE_NOTE_KEY)
    if (legacySingleStr) {
      try {
        const notebook: Notebook = JSON.parse(legacySingleStr)
        // Ensure it has an ID
        if (!notebook.id) notebook.id = uuidv4()
        
        await db.saveNotebook(notebook)
        localStorage.removeItem(LEGACY_SINGLE_NOTE_KEY)
        console.log('Migrated single notebook to IndexedDB')
      } catch (e) {
        console.error('Migration failed (single)', e)
      }
    }
  }

  // Initialize
  useEffect(() => {
    const init = async () => {
      await migrateFromLocalStorage()
      
      const allMetadata = await db.getAllMetadata()
      setNotebooks(allMetadata)

      if (allMetadata.length > 0) {
        // Load most recently modified
        const notebook = await db.getNotebook(allMetadata[0].id)
        if (notebook) {
          setCurrentNotebook(notebook)
        } else {
          // Metadata exists but data missing?
          await createNotebookInternal()
        }
      } else {
        await createNotebookInternal()
      }
      
      setIsLoading(false)
    }

    init()
  }, [])

  const createNotebookInternal = async () => {
    const newNotebook = createNewNotebook()
    await db.saveNotebook(newNotebook)
    
    const newMeta: NotebookMetadata = {
      id: newNotebook.id,
      title: newNotebook.title,
      createdAt: newNotebook.createdAt,
      lastModified: newNotebook.createdAt
    }
    
    setNotebooks(prev => [newMeta, ...prev])
    setCurrentNotebook(newNotebook)
    return newNotebook
  }

  // Public Actions
  const createNotebook = async () => {
    await createNotebookInternal()
  }

  const loadNotebook = async (id: string, targetPage?: number) => {
    const notebook = await db.getNotebook(id)
    if (notebook) {
      if (targetPage) {
        notebook.currentPage = targetPage
        // Don't save this page change to DB immediately to avoid history pollution? 
        // Or yes, save it as "last opened page".
        await db.saveNotebook(notebook)
      }
      setCurrentNotebook(notebook)
    } else {
      alert('ノートの読み込みに失敗しました。')
    }
  }

  const deleteNotebook = async (id: string) => {
    if (notebooks.length <= 1) {
      alert('最後の1冊は削除できません。')
      return
    }
    
    if (!confirm('このノートを削除しますか？\n(復元できません)')) return

    await db.deleteNotebook(id)
    
    const newNotebooks = notebooks.filter(n => n.id !== id)
    setNotebooks(newNotebooks)

    if (currentNotebook?.id === id) {
      // Switch to another
      loadNotebook(newNotebooks[0].id)
    }
  }

  const updateNotebook = async (notebook: Notebook) => {
    // Optimistic UI update
    setCurrentNotebook(notebook)
    
    // Background save
    await db.saveNotebook(notebook)
    
        // Update metadata list if title changed
    
        setNotebooks(prev => prev.map(n => 
    
          n.id === notebook.id 
    
            ? { ...n, title: notebook.title, lastModified: new Date().toISOString() }
    
            : n
    
        ))
    
      }
    
    
    
            const searchNotebooks = async (query: string) => {
    
    
    
              return await db.searchAllNotebooks(query)
    
    
    
            }
    
    
    
          
    
    
    
            const getCalendarData = useCallback(async () => {
    
    
    
              try {
    
    
    
                return await db.getNotebooksForCalendar()
    
    
    
              } catch (e) {
    
    
    
                console.error('Failed to get calendar data', e)
    
    
    
                return []
    
    
    
              }
    
    
    
            }, [])
    
    
    
          
    
    
    
            return {
    
    
    
              notebooks,
    
    
    
              currentNotebook,
    
    
    
              isLoading,
    
    
    
              createNotebook,
    
    
    
              loadNotebook,
    
    
    
              deleteNotebook,
    
    
    
              updateNotebook,
    
    
    
              searchNotebooks,
    
    
    
              getCalendarData
    
    
    
            }
    
    
    
          }    
    