import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Notebook, NotebookMetadata } from './types'

interface ToshiyukiDB extends DBSchema {
  metadata: {
    key: string;
    value: NotebookMetadata;
  };
  notebooks: {
    key: string;
    value: Notebook;
  };
}

const DB_NAME = 'toshiyuki-db'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ToshiyukiDB>>

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ToshiyukiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('notebooks')) {
          db.createObjectStore('notebooks', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export const db = {
  async getAllMetadata(): Promise<NotebookMetadata[]> {
    const db = await initDB()
    // Sort by lastModified desc manually if needed, or use index in future
    const all = await db.getAll('metadata')
    return all.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
  },

  async getNotebook(id: string): Promise<Notebook | undefined> {
    const db = await initDB()
    return db.get('notebooks', id)
  },

  async saveNotebook(notebook: Notebook): Promise<void> {
    const db = await initDB()
    const tx = db.transaction(['notebooks', 'metadata'], 'readwrite')
    
    // Save full notebook
    await tx.objectStore('notebooks').put(notebook)
    
    // Update metadata
    await tx.objectStore('metadata').put({
      id: notebook.id,
      title: notebook.title,
      createdAt: notebook.createdAt,
      lastModified: new Date().toISOString() // Update timestamp
    })
    
    await tx.done
  },
  
  // Specifically for saving just metadata (e.g. initial migration)
  async saveMetadata(metadata: NotebookMetadata): Promise<void> {
    const db = await initDB()
    await db.put('metadata', metadata)
  },

  async getNotebooksForCalendar(): Promise<Notebook[]> {
    const db = await initDB()
    const tx = db.transaction('notebooks', 'readonly')
    const store = tx.objectStore('notebooks')
    
    const lightNotebooks: Notebook[] = []
    let cursor = await store.openCursor()
    
    while (cursor) {
      const nb = cursor.value
      // Create a lightweight copy
      const lightNb: any = {
        id: nb.id,
        title: nb.title,
        pages: nb.pages.map((p: any) => ({
          pageNumber: p.pageNumber,
          lastModified: p.lastModified,
          // We only need to know if content/attachments exist
          content: p.content && p.content.length > 0 ? 'exists' : '',
          attachments: p.attachments && p.attachments.length > 0 ? [{ id: 'dummy', type: 'image', data: '', createdAt: '' }] : []
        }))
      }
      lightNotebooks.push(lightNb)
      cursor = await cursor.continue()
    }
    
    return lightNotebooks
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

    for (const notebook of notebooks) {
      for (const page of notebook.pages) {
        if (page.content.includes(query)) {
          // Extract snippet
          const index = page.content.indexOf(query)
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
