import type { Notebook } from '../types'
import { fileDb } from '../fileStorage'

export interface CloudUser { id: string; username: string }
interface Session { token: string; user: CloudUser }
interface Baseline { version: number; digest: string }
interface RemoteMeta { id: string; version: number; deleted: number }
type WireNotebook = Omit<Notebook, 'pages'> & { pages: Array<Omit<Notebook['pages'][number], 'attachments'> & { attachments?: Array<Omit<NonNullable<Notebook['pages'][number]['attachments']>[number], 'data'> & { data: string | object }> }> }
const SESSION_KEY = 'tn-cloud-session-v1'
const OWNER_KEY = 'tn-cloud-owners-v1'
const DELETED_KEY = 'tn-cloud-deleted-v1'
const REGISTRY = 'https://raw.githubusercontent.com/shimatoshi/project-urls/main/urls.json'
let endpoint = ''
function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
let session: Session | null = readStored<Session | null>(SESSION_KEY, null)
let running: Promise<string> | null = null

export function cloudSession() { return session }
export function cloudForget() { session = null; localStorage.removeItem(SESSION_KEY) }
function baseKey(user: CloudUser) { return `tn-cloud-baseline-v1:${user.id}` }
function owners(): Record<string, string> { return readStored<Record<string,string>>(OWNER_KEY, {}) }
export function recordLocalDeletion(id: string) {
  const deleted: Record<string, string> = readStored<Record<string,string>>(DELETED_KEY, {})
  const owner = owners()[id]
  if (owner) { deleted[id] = owner; localStorage.setItem(DELETED_KEY, JSON.stringify(deleted)) }
}
async function resolveEndpoint() {
  const configured = import.meta.env.VITE_NOTE_API_URL as string | undefined
  if (configured) { endpoint = configured.replace(/\/$/, ''); return }
  const response = await fetch(REGISTRY + '?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error('クラウドの接続先を確認できません')
  const registry = await response.json()
  const url = registry.projects?.['toshiyuki-note-api']?.url
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('クラウドサーバーが未接続です')
  endpoint = url.replace(/\/$/, '')
}
async function api<T>(path: string, method = 'GET', body?: object, active = session): Promise<T> {
  const response = await fetch(endpoint + path, {
    method, headers: { 'Content-Type': 'application/json', ...(active ? { Authorization: `Bearer ${active.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000), cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.error || 'クラウドへの接続に失敗しました') as Error & { status: number }
    error.status = response.status
    throw error
  }
  return data as T
}
export async function cloudLogin(username: string, password: string, register = false) {
  await resolveEndpoint()
  session = await api<Session>(register ? '/auth/register' : '/auth/login', 'POST', { username, password }, null)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session.user
}
export async function cloudLogout() {
  const active = session
  cloudForget()
  if (endpoint && active) await api('/auth/logout', 'POST', {}, active).catch(() => {})
}
async function wire(notebook: Notebook): Promise<WireNotebook> {
  const nb = await fileDb.hydrateNotebook(notebook)
  return { ...nb, pages: await Promise.all(nb.pages.map(async page => ({ ...page,
    attachments: await Promise.all((page.attachments || []).map(async attachment => {
      if (attachment.loaded === false) throw new Error('添付ファイルを読み込めません')
      let data: string | object = attachment.data
      if (attachment.data instanceof Blob) data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(attachment.data as Blob)
      })
      return { ...attachment, loaded: true, data }
    }))
  }))) }
}
async function digest(nb: WireNotebook) {
  // Filesystem metadata timestamps and last-opened page are device-local.
  const canonical = JSON.stringify({ title: nb.title, createdAt: nb.createdAt, backgroundUri: nb.backgroundUri || '', showLines: !!nb.showLines,
    pages: nb.pages.map(p => ({ pageNumber: p.pageNumber, content: p.content,
      attachments: (p.attachments || []).map(a => ({ id:a.id, type:a.type, name:a.name || '', mimeType:a.mimeType || '', createdAt:a.createdAt, data:a.data })) })) })
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))).map(x => x.toString(16).padStart(2,'0')).join('')
}
function restore(nb: WireNotebook): Notebook {
  return { ...nb, pages: nb.pages.map(p => ({ ...p, attachments: p.attachments?.map(a => {
    if (a.type === 'location') return { ...a, loaded: true }
    const data = a.data as string
    const [header, base64] = data.split(',')
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    return { ...a, loaded:true, data: new Blob([bytes], {type: a.mimeType || header.match(/^data:(.*);base64$/)?.[1] || 'application/octet-stream'}) }
  }) })) }
}
export function syncCloud(): Promise<string> {
  if (running) return running
  running = performSync().finally(() => { running = null })
  return running
}
async function performSync(): Promise<string> {
  const active = session
  if (!active) throw new Error('ログインしてください')
  await resolveEndpoint()
  const request = <T>(path: string, method = 'GET', body?: object) => api<T>(path,method,body,active)
  const baseline: Record<string, Baseline> = readStored<Record<string,Baseline>>(baseKey(active.user), {})
  const owner = owners()
  const deleted: Record<string,string> = readStored<Record<string,string>>(DELETED_KEY, {})
  const checkpoint = () => {
    localStorage.setItem(baseKey(active.user),JSON.stringify(baseline))
    localStorage.setItem(OWNER_KEY,JSON.stringify(owner))
    localStorage.setItem(DELETED_KEY,JSON.stringify(deleted))
  }
  const remote = new Map((await request<{notebooks:RemoteMeta[]}>('/notebooks')).notebooks.map(n => [n.id,n]))
  const local = new Map((await fileDb.getAllMetadata()).map(n => [n.id,n]))
  let uploaded = 0, downloaded = 0, conflicts = 0
  const upload = async (id: string, nb: WireNotebook, version: number) => {
    const result = await request<{version:number}>('/notebooks/'+id,'PUT',{version,notebook:nb})
    baseline[id] = { version:result.version,digest:await digest(nb) };owner[id]=active.user.id;uploaded++;checkpoint()
  }
  const unchanged = async (id: string, expected: string) => {
    const current = await fileDb.getNotebook(id)
    const actual = current ? await digest(await wire(current)) : ''
    if (actual !== expected) throw new Error('同期中に端末のノートが更新されました。もう一度同期してください')
  }
  const fork = async (nb: WireNotebook) => {
    const copy = { ...nb, id:crypto.randomUUID(),title:nb.title+'（競合コピー）' }
    // Save the local copy before any network upload or replacement of the original.
    await fileDb.saveNotebook(restore(copy));owner[copy.id]=active.user.id;checkpoint()
    await upload(copy.id,copy,0);conflicts++
  }
  for (const id of new Set([...local.keys(),...remote.keys(),...Object.keys(deleted)])) {
    if (session?.user.id !== active.user.id) throw new Error('アカウントが切り替わりました')
    if (owner[id] && owner[id] !== active.user.id) continue
    const r = remote.get(id); const b = baseline[id]
    if (deleted[id] === active.user.id) {
      if (r && !r.deleted && b?.version === r.version) {
        await request('/notebooks/'+id,'DELETE',{version:r.version});delete baseline[id];delete deleted[id];checkpoint();continue
      }
      if (!r || r.deleted) { delete baseline[id];delete deleted[id];checkpoint();continue }
      // Concurrent remote edit wins over a local deletion; restore it below.
      delete deleted[id];checkpoint()
    }
    const nb = local.has(id) ? await fileDb.getNotebook(id) : undefined
    const snapshot = nb ? await wire(nb) : undefined
    const hash = snapshot ? await digest(snapshot) : ''
    const changed = !!snapshot && (!b || hash !== b.digest)
    if (!r) { if(snapshot) await upload(id,snapshot,0);continue }
    if (r.deleted) {
      if (changed && snapshot) await fork(snapshot)
      if (nb) { await unchanged(id,hash);await fileDb.deleteNotebook(id) }
      delete baseline[id];checkpoint();continue
    }
    if (b && r.version === b.version) {
      if (changed && snapshot) await upload(id,snapshot,r.version)
      // Missing local content is recovered; never infer deletion from absence.
      if (snapshot) continue
    }
    const result = await request<{version:number;notebook:WireNotebook}>('/notebooks/'+id)
    const remoteHash = await digest(result.notebook)
    if (snapshot && hash === remoteHash) {
      baseline[id]={version:result.version,digest:hash};owner[id]=active.user.id;checkpoint();continue
    }
    if (changed && snapshot) await fork(snapshot)
    await unchanged(id,hash)
    await fileDb.saveNotebook(restore(result.notebook))
    baseline[id]={version:result.version,digest:remoteHash};owner[id]=active.user.id;downloaded++;checkpoint()
  }
  return `同期完了：アップロード${uploaded}冊・取得${downloaded}冊${conflicts ? `・競合コピー${conflicts}冊` : ''}`
}
