import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Notebook, NotebookMetadata, Page } from '../types'

const TOTAL_PAGES = 100
const METADATA_KEY = 'toshiyuki-notebooks-metadata'
const NOTEBOOK_PREFIX = 'toshiyuki-notebook-'

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

  // Initialize: Load metadata list
  useEffect(() => {
    const savedMetadata = localStorage.getItem(METADATA_KEY)
    if (savedMetadata) {
      try {
        const parsed = JSON.parse(savedMetadata)
        setNotebooks(parsed)
        // Load the first notebook or the last opened one?
        // For simplicity, load the first one if exists
        if (parsed.length > 0) {
           loadNotebook(parsed[0].id)
        } else {
           // No notebooks, create one
           createNotebook()
        }
      } catch (e) {
        console.error('Failed to parse metadata', e)
        createNotebook()
      }
    } else {
      createNotebook()
    }
    setIsLoading(false)
  }, [])

  const saveMetadata = (newNotebooks: NotebookMetadata[]) => {
    localStorage.setItem(METADATA_KEY, JSON.stringify(newNotebooks))
    setNotebooks(newNotebooks)
  }

  const saveCurrentNotebook = (notebook: Notebook) => {
    localStorage.setItem(`${NOTEBOOK_PREFIX}${notebook.id}`, JSON.stringify(notebook))
    setCurrentNotebook(notebook)

    // Update metadata (title/lastModified might change)
    const newMetadata = notebooks.map(n => 
      n.id === notebook.id 
        ? { ...n, title: notebook.title, lastModified: new Date().toISOString() } 
        : n
    )
    saveMetadata(newMetadata)
  }

  const createNotebook = () => {
    const newNotebook = createNewNotebook()
    
    // Save new notebook data
    localStorage.setItem(`${NOTEBOOK_PREFIX}${newNotebook.id}`, JSON.stringify(newNotebook))
    
    // Add to metadata
    const newMeta: NotebookMetadata = {
      id: newNotebook.id,
      title: newNotebook.title,
      createdAt: newNotebook.createdAt,
      lastModified: newNotebook.createdAt
    }
    
    const newNotebooks = [newMeta, ...notebooks] // Add to top
    saveMetadata(newNotebooks)
    setCurrentNotebook(newNotebook)
    return newNotebook
  }

  const loadNotebook = (id: string) => {
    const saved = localStorage.getItem(`${NOTEBOOK_PREFIX}${id}`)
    if (saved) {
      try {
        const notebook = JSON.parse(saved)
        setCurrentNotebook(notebook)
      } catch (e) {
        console.error('Failed to load notebook', id, e)
        alert('ノートの読み込みに失敗しました。')
      }
    } else {
       // If data is missing but metadata exists (rare case), remove metadata?
       // For now, just alert.
       alert('ノートデータが見つかりません。')
    }
  }

  const deleteNotebook = (id: string) => {
    if (notebooks.length <= 1) {
      alert('最後の1冊は削除できません。')
      return
    }
    
    if (!confirm('このノートを削除しますか？\n(復元できません)')) return

    // Remove data
    localStorage.removeItem(`${NOTEBOOK_PREFIX}${id}`)
    
    // Remove metadata
    const newNotebooks = notebooks.filter(n => n.id !== id)
    saveMetadata(newNotebooks)

    // If current was deleted, switch to another
    if (currentNotebook?.id === id) {
      loadNotebook(newNotebooks[0].id)
    }
  }

  const updateNotebook = (notebook: Notebook) => {
    saveCurrentNotebook(notebook)
  }

  return {
    notebooks,
    currentNotebook,
    isLoading,
    createNotebook,
    loadNotebook,
    deleteNotebook,
    updateNotebook
  }
}
