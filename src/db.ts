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

  async deleteNotebook(id: string): Promise<void> {
    const db = await initDB()
    const tx = db.transaction(['notebooks', 'metadata'], 'readwrite')
    await tx.objectStore('notebooks').delete(id)
    await tx.objectStore('metadata').delete(id)
    await tx.done
  }
}
