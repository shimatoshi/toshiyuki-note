import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Notebook, NotebookMetadata, Attachment } from './types'

// --- Blob <-> Base64 変換ユーティリティ ---

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

// 保存前: Blob → Base64文字列に変換
async function serializeAttachments(notebook: Notebook): Promise<Notebook> {
  const serializedPages = await Promise.all(
    notebook.pages.map(async page => {
      if (!page.attachments || page.attachments.length === 0) return page

      const serializedAttachments = await Promise.all(
        page.attachments.map(async (att): Promise<Attachment> => {
          if (att.data instanceof Blob) {
            return { ...att, data: await blobToBase64(att.data) }
          }
          return att
        })
      )
      return { ...page, attachments: serializedAttachments }
    })
  )
  return { ...notebook, pages: serializedPages }
}

// 読み出し後: Base64文字列 → Blobに復元
function deserializeAttachments(notebook: Notebook): Notebook {
  const restoredPages = notebook.pages.map(page => {
    if (!page.attachments || page.attachments.length === 0) return page

    const restoredAttachments = page.attachments.map((att): Attachment => {
      if (typeof att.data === 'string' && att.data.startsWith('data:') && (att.type === 'image' || att.type === 'file')) {
        return { ...att, data: base64ToBlob(att.data) }
      }
      return att
    })
    return { ...page, attachments: restoredAttachments }
  })
  return { ...notebook, pages: restoredPages }
}

interface CalendarIndexEntry {
  notebookId: string
  title: string
  pageNumber: number
  time: string
}

interface ToshiyukiDB extends DBSchema {
  metadata: {
    key: string;
    value: NotebookMetadata;
  };
  notebooks: {
    key: string;
    value: Notebook;
  };
  calendar_index: {
    key: string; // YYYY-MM-DD
    value: CalendarIndexEntry[];
  };
}

const DB_NAME = 'toshiyuki-db'
const DB_VERSION = 2 // Increment version

let dbPromise: Promise<IDBPDatabase<ToshiyukiDB>>

export const initDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<ToshiyukiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('notebooks')) {
          db.createObjectStore('notebooks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('calendar_index')) {
          db.createObjectStore('calendar_index')
        }
      },
    }).catch(err => {
      console.error('Failed to open IndexedDB:', err)
      throw err
    })
  }
  return dbPromise
}

export const db = {
  async getAllMetadata(): Promise<NotebookMetadata[]> {
    try {
      const db = await initDB()
      const all = await db.getAll('metadata')
      return all.sort((a, b) => {
        try {
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        } catch (e) {
          return 0
        }
      })
    } catch (e) {
      console.error('getAllMetadata error', e)
      return []
    }
  },

  async getNotebook(id: string): Promise<Notebook | undefined> {
    const db = await initDB()
    const notebook = await db.get('notebooks', id)
    if (!notebook) return undefined
    return deserializeAttachments(notebook)
  },

  async saveNotebook(notebook: Notebook): Promise<void> {
    const serialized = await serializeAttachments(notebook)
    const db = await initDB()
    const tx = db.transaction(['notebooks', 'metadata', 'calendar_index'], 'readwrite')

    // Save full notebook (with Base64 attachments)
    await tx.objectStore('notebooks').put(serialized)
    
    // Update metadata
    await tx.objectStore('metadata').put({
      id: notebook.id,
      title: notebook.title,
      createdAt: notebook.createdAt,
      lastModified: new Date().toISOString()
    })

    // Update Calendar Index (Efficiently)
    // 1. Get entries for this notebook and remove old ones (Wait, iterating all keys is slow. 
    // Ideally we store index by date. But updating a notebook means we might change dates or content.
    // Simple approach: Iterate pages of THIS notebook and update index for those dates.)
    
    // Correct Approach: 
    // We are organizing index by DATE. So index['2026-02-13'] = [{nbId, pg1}, {nbId, pg2}...]
    // When saving a notebook, we should update the entries for the dates present in this notebook.
    // However, cleaning up OLD entries for this notebook from dates that are no longer relevant is hard without reverse index.
    // For now, let's just ADD/UPDATE entries for current pages. Old garbage might remain but it's just text.
    // Better: We can check if we really need to delete. 
    // Let's keep it simple: Just add/update for now.
    
    for (const page of notebook.pages) {
      if ((page.content && page.content.trim().length > 0) || (page.attachments && page.attachments.length > 0)) {
        if (page.lastModified) {
           try {
             const d = new Date(page.lastModified)
             if (!isNaN(d.getTime())) {
               const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
               
               const existing = (await tx.objectStore('calendar_index').get(dateKey)) || []
               // Remove existing entry for this page to avoid duplicates
               const filtered = existing.filter(e => !(e.notebookId === notebook.id && e.pageNumber === page.pageNumber))
               
               filtered.push({
                 notebookId: notebook.id,
                 title: notebook.title,
                 pageNumber: page.pageNumber,
                 time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
               })
               
               await tx.objectStore('calendar_index').put(filtered, dateKey)
             }
           } catch (e) {
             console.error(e)
           }
        }
      }
    }
    
    await tx.done
  },
  
  async getCalendarIndex(year: number, month: number): Promise<Array<{ date: string } & CalendarIndexEntry>> {
    const db = await initDB()
    const startKey = `${year}-${String(month).padStart(2, '0')}-01`
    const endKey = `${year}-${String(month).padStart(2, '0')}-31`
    const range = IDBKeyRange.bound(startKey, endKey)

    const keys = await db.getAllKeys('calendar_index', range)
    const results: Array<{ date: string } & CalendarIndexEntry> = []

    for (const key of keys) {
      const entries = await db.get('calendar_index', key)
      if (entries) {
        entries.forEach(e => {
          results.push({
            date: key as string,
            ...e
          })
        })
      }
    }
    return results
  },

  // Specifically for saving just metadata (e.g. initial migration)
  async saveMetadata(metadata: NotebookMetadata): Promise<void> {
    const db = await initDB()
    await db.put('metadata', metadata)
  },

  async rebuildCalendarIndex(): Promise<void> {
    const db = await initDB()
    const store = db.transaction('notebooks', 'readonly').objectStore('notebooks')
    
    const fullIndex: Record<string, CalendarIndexEntry[]> = {}
    let cursor = await store.openCursor()
    
    while (cursor) {
      const nb = cursor.value
      if (nb.pages) {
        for (const page of nb.pages) {
          const hasContent = (page.content && page.content.length > 0) || (page.attachments && page.attachments.length > 0)
          
          if (hasContent && page.lastModified) {
             const d = new Date(page.lastModified)
             if (!isNaN(d.getTime())) {
               const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
               
               if (!fullIndex[dateKey]) fullIndex[dateKey] = []
               fullIndex[dateKey].push({
                 notebookId: nb.id,
                 title: nb.title,
                 pageNumber: page.pageNumber,
                 time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
               })
             }
          }
        }
      }
      cursor = await cursor.continue()
    }

    // Write all at once
    const tx = db.transaction('calendar_index', 'readwrite')
    await tx.objectStore('calendar_index').clear()
    for (const [dateKey, entries] of Object.entries(fullIndex)) {
      await tx.objectStore('calendar_index').put(entries, dateKey)
    }
    await tx.done
  },

  async deleteNotebook(id: string): Promise<void> {
    const db = await initDB()
    const tx = db.transaction(['notebooks', 'metadata'], 'readwrite')
    await tx.objectStore('notebooks').delete(id)
    await tx.objectStore('metadata').delete(id)
    await tx.done
  },

  async searchAllNotebooks(query: string): Promise<{ notebookId: string; title: string; pageNumber: number; snippet: string }[]> {
    if (!query.trim()) return []
    const db = await initDB()
    const notebooks = await db.getAll('notebooks')
    const results: { notebookId: string; title: string; pageNumber: number; snippet: string }[] = []

    const lowerQuery = query.toLowerCase()
    for (const notebook of notebooks) {
      for (const page of notebook.pages) {
        const lowerContent = page.content.toLowerCase()
        if (lowerContent.includes(lowerQuery)) {
          // Extract snippet
          const index = lowerContent.indexOf(lowerQuery)
          const start = Math.max(0, index - 20)
          const end = Math.min(page.content.length, index + query.length + 20)
          const snippet = (start > 0 ? '...' : '') + page.content.slice(start, end) + (end < page.content.length ? '...' : '')
          
          results.push({
            notebookId: notebook.id,
            title: notebook.title,
            pageNumber: page.pageNumber,
            snippet
          })
        }
      }
    }
    return results
  }
}
