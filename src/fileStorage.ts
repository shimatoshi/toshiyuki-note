import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import type { Notebook, NotebookMetadata, Page, Attachment } from './types'

const ROOT = 'ToshiyukiNote'
const TOTAL_PAGES = 100

// Use ExternalStorage on Android (/sdcard/ToshiyukiNote/), fallback to Documents on web
const DIR = Capacitor.isNativePlatform() ? Directory.ExternalStorage : Directory.Documents

// ==========================================
// Helpers
// ==========================================

function pagePath(notebookId: string, pageNum: number): string {
  return `${ROOT}/${notebookId}/pages/${String(pageNum).padStart(3, '0')}.txt`
}

function metaPath(notebookId: string): string {
  return `${ROOT}/${notebookId}/meta.json`
}

function indexPath(): string {
  return `${ROOT}/index.json`
}

function manifestPath(notebookId: string): string {
  return `${ROOT}/${notebookId}/attachments/manifest.json`
}

async function ensureDir(path: string) {
  try {
    await Filesystem.mkdir({ path, directory: DIR, recursive: true })
  } catch {
    // Already exists
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 })
    return result.data as string
  } catch {
    return null
  }
}

async function writeText(path: string, data: string): Promise<void> {
  await Filesystem.writeFile({ path, directory: DIR, data, encoding: Encoding.UTF8, recursive: true })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DIR })
    return true
  } catch {
    return false
  }
}

// ==========================================
// Init
// ==========================================

export async function initStorage(): Promise<void> {
  await ensureDir(ROOT)
  if (!(await fileExists(indexPath()))) {
    await writeText(indexPath(), '[]')
  }
}

// ==========================================
// Index management
// ==========================================

async function readIndex(): Promise<NotebookMetadata[]> {
  const content = await readText(indexPath())
  if (!content) return []
  try {
    return JSON.parse(content)
  } catch {
    return []
  }
}

async function writeIndex(index: NotebookMetadata[]): Promise<void> {
  await writeText(indexPath(), JSON.stringify(index, null, 2))
}

async function updateIndex(meta: NotebookMetadata): Promise<void> {
  const index = await readIndex()
  const existing = index.findIndex(m => m.id === meta.id)
  if (existing >= 0) {
    index[existing] = meta
  } else {
    index.push(meta)
  }
  await writeIndex(index)
}

async function removeFromIndex(id: string): Promise<void> {
  const index = await readIndex()
  await writeIndex(index.filter(m => m.id !== id))
}

// ==========================================
// Notebook CRUD
// ==========================================

export const fileDb = {
  async getAllMetadata(): Promise<NotebookMetadata[]> {
    try {
      const index = await readIndex()
      return index.sort((a, b) => {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      })
    } catch (e) {
      console.error('getAllMetadata error', e)
      return []
    }
  },

  async getNotebook(id: string): Promise<Notebook | undefined> {
    try {
      const metaStr = await readText(metaPath(id))
      if (!metaStr) return undefined
      const meta = JSON.parse(metaStr)

      // Read all pages
      const pages: Page[] = []
      const totalPages = meta.totalPages || TOTAL_PAGES
      for (let i = 1; i <= totalPages; i++) {
        const content = await readText(pagePath(id, i)) || ''
        pages.push({
          pageNumber: i,
          content,
          lastModified: meta.lastModified || meta.createdAt,
        })
      }

      // Read attachments
      const manifestStr = await readText(manifestPath(id))
      const manifest = manifestStr ? JSON.parse(manifestStr) : {}

      // Attach attachments to pages
      for (const [pageKey, atts] of Object.entries(manifest)) {
        const pageNum = parseInt(pageKey)
        const page = pages.find(p => p.pageNumber === pageNum)
        if (page && Array.isArray(atts)) {
          page.attachments = await Promise.all(
            (atts as any[]).map(async (att: any) => {
              const attachment: Attachment = {
                id: att.id,
                type: att.type,
                name: att.name,
                mimeType: att.mimeType,
                createdAt: att.createdAt,
                data: '',
              }

              if (att.type === 'location') {
                const locStr = await readText(`${ROOT}/${id}/attachments/${att.id}.json`)
                attachment.data = locStr ? JSON.parse(locStr) : {}
              } else {
                // Read binary as base64 data URL
                try {
                  const result = await Filesystem.readFile({
                    path: `${ROOT}/${id}/attachments/${att.id}${att.ext}`,
                    directory: DIR,
                  })
                  const mimeType = att.mimeType || guessMime(att.ext)
                  const base64 = result.data as string
                  const dataUrl = `data:${mimeType};base64,${base64}`
                  // Convert to Blob for compatibility with existing UI
                  attachment.data = dataUrlToBlob(dataUrl)
                } catch {
                  attachment.data = new Blob()
                }
              }
              return attachment
            })
          )
        }
      }

      return {
        id: meta.id,
        title: meta.title,
        createdAt: meta.createdAt,
        currentPage: meta.currentPage || 1,
        pages,
        backgroundUri: meta.backgroundUri,
        showLines: meta.showLines,
      }
    } catch (e) {
      console.error('getNotebook error', e)
      return undefined
    }
  },

  async saveNotebook(notebook: Notebook): Promise<void> {
    try {
      const now = new Date().toISOString()
      const id = notebook.id
      const totalPages = notebook.pages.length

      // Ensure directories
      await ensureDir(`${ROOT}/${id}/pages`)
      await ensureDir(`${ROOT}/${id}/attachments`)

      // Save each page
      for (const page of notebook.pages) {
        await writeText(pagePath(id, page.pageNumber), page.content)
      }

      // Save attachments
      const manifest: Record<string, any[]> = {}
      for (const page of notebook.pages) {
        if (page.attachments && page.attachments.length > 0) {
          const pageAtts: any[] = []
          for (const att of page.attachments) {
            const attEntry: any = {
              id: att.id,
              type: att.type,
              name: att.name,
              mimeType: att.mimeType,
              createdAt: att.createdAt,
            }

            if (att.type === 'location') {
              attEntry.ext = '.json'
              await writeText(
                `${ROOT}/${id}/attachments/${att.id}.json`,
                JSON.stringify(att.data)
              )
            } else if (att.data instanceof Blob) {
              const ext = guessExt(att.mimeType || att.name || '')
              attEntry.ext = ext
              const base64 = await blobToBase64Raw(att.data)
              await Filesystem.writeFile({
                path: `${ROOT}/${id}/attachments/${att.id}${ext}`,
                directory: DIR,
                data: base64,
              })
            } else if (typeof att.data === 'string' && att.data.startsWith('data:')) {
              const ext = guessExt(att.mimeType || att.name || '')
              attEntry.ext = ext
              const base64 = att.data.split(',')[1]
              await Filesystem.writeFile({
                path: `${ROOT}/${id}/attachments/${att.id}${ext}`,
                directory: DIR,
                data: base64,
              })
            }

            pageAtts.push(attEntry)
          }
          manifest[String(page.pageNumber)] = pageAtts
        }
      }

      await writeText(manifestPath(id), JSON.stringify(manifest, null, 2))

      // Save meta
      const meta = {
        id,
        title: notebook.title,
        createdAt: notebook.createdAt,
        lastModified: now,
        currentPage: notebook.currentPage,
        totalPages,
        showLines: notebook.showLines || false,
        backgroundUri: notebook.backgroundUri || '',
      }
      await writeText(metaPath(id), JSON.stringify(meta, null, 2))

      // Update index
      await updateIndex({
        id,
        title: notebook.title,
        createdAt: notebook.createdAt,
        lastModified: now,
      })
    } catch (e) {
      console.error('saveNotebook error', e)
    }
  },

  async deleteNotebook(id: string): Promise<void> {
    try {
      await Filesystem.rmdir({
        path: `${ROOT}/${id}`,
        directory: DIR,
        recursive: true,
      })
      await removeFromIndex(id)
    } catch (e) {
      console.error('deleteNotebook error', e)
    }
  },

  async searchAllNotebooks(query: string): Promise<{ notebookId: string; title: string; pageNumber: number; snippet: string }[]> {
    if (!query.trim()) return []
    const results: { notebookId: string; title: string; pageNumber: number; snippet: string }[] = []
    const lowerQuery = query.toLowerCase()

    const index = await readIndex()
    for (const meta of index) {
      const metaStr = await readText(metaPath(meta.id))
      if (!metaStr) continue
      const nbMeta = JSON.parse(metaStr)
      const totalPages = nbMeta.totalPages || TOTAL_PAGES

      for (let i = 1; i <= totalPages; i++) {
        const content = await readText(pagePath(meta.id, i))
        if (!content) continue
        const lowerContent = content.toLowerCase()
        if (lowerContent.includes(lowerQuery)) {
          const idx = lowerContent.indexOf(lowerQuery)
          const start = Math.max(0, idx - 20)
          const end = Math.min(content.length, idx + query.length + 20)
          const snippet = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
          results.push({
            notebookId: meta.id,
            title: meta.title,
            pageNumber: i,
            snippet,
          })
        }
      }
    }
    return results
  },

  // Calendar index — built from file modification times
  async getCalendarIndex(year: number, month: number): Promise<{ date: string; notebookId: string; title: string; pageNumber: number; time: string }[]> {
    const results: { date: string; notebookId: string; title: string; pageNumber: number; time: string }[] = []
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    const index = await readIndex()
    for (const meta of index) {
      const metaStr = await readText(metaPath(meta.id))
      if (!metaStr) continue
      const nbMeta = JSON.parse(metaStr)
      const totalPages = nbMeta.totalPages || TOTAL_PAGES

      for (let i = 1; i <= totalPages; i++) {
        try {
          const stat = await Filesystem.stat({
            path: pagePath(meta.id, i),
            directory: DIR,
          })
          if (stat.mtime) {
            const d = new Date(stat.mtime)
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (dateStr.startsWith(prefix)) {
              // Check if page has content
              const content = await readText(pagePath(meta.id, i))
              if (content && content.trim().length > 0) {
                results.push({
                  date: dateStr,
                  notebookId: meta.id,
                  title: meta.title,
                  pageNumber: i,
                  time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                })
              }
            }
          }
        } catch {
          // File doesn't exist
        }
      }
    }
    return results
  },

  async saveMetadata(metadata: NotebookMetadata): Promise<void> {
    await updateIndex(metadata)
  },

  async rebuildCalendarIndex(): Promise<void> {
    // No-op: calendar is built from file stats on demand
  },
}

// ==========================================
// Migration from IndexedDB
// ==========================================

export async function migrateFromIndexedDB(): Promise<boolean> {
  const MIGRATION_KEY = 'toshiyuki-migrated-to-files-v1'
  if (localStorage.getItem(MIGRATION_KEY)) return false

  try {
    // Dynamic import to avoid loading idb if not needed
    const { db: idb, initDB } = await import('./db')
    await initDB()

    const metadata = await idb.getAllMetadata()
    if (metadata.length === 0) {
      localStorage.setItem(MIGRATION_KEY, 'true')
      return false
    }

    console.log(`Migrating ${metadata.length} notebooks from IndexedDB to files...`)

    for (const meta of metadata) {
      const notebook = await idb.getNotebook(meta.id)
      if (notebook) {
        await fileDb.saveNotebook(notebook)
        console.log(`Migrated: ${notebook.title}`)
      }
    }

    localStorage.setItem(MIGRATION_KEY, 'true')
    console.log('Migration complete!')
    return true
  } catch (e) {
    console.error('Migration error:', e)
    return false
  }
}

// ==========================================
// Utility functions
// ==========================================

function blobToBase64Raw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove data URL prefix, return raw base64
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

function guessExt(nameOrMime: string): string {
  const lower = nameOrMime.toLowerCase()
  if (lower.includes('jpeg') || lower.includes('jpg')) return '.jpg'
  if (lower.includes('png')) return '.png'
  if (lower.includes('gif')) return '.gif'
  if (lower.includes('webp')) return '.webp'
  if (lower.includes('pdf')) return '.pdf'
  if (lower.includes('.')) return lower.substring(lower.lastIndexOf('.'))
  return '.dat'
}

function guessMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.pdf': return 'application/pdf'
    case '.txt': return 'text/plain'
    default: return 'application/octet-stream'
  }
}
