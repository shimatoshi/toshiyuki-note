import { useState, useEffect, useCallback, useRef } from 'react'
import { cloudSession, cloudLogin, cloudLogout, syncCloud } from '../lib/cloud'

export function useSync(prepare: () => Promise<void>, refresh: () => Promise<void>, ready: boolean) {
  const [user, setUser] = useState(cloudSession()?.user ?? null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)
  const lastAuto = useRef(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const callbacks = useRef({prepare,refresh,ready})
  useEffect(() => { callbacks.current = {prepare,refresh,ready} }, [prepare,refresh,ready])
  const runSync = useCallback(async (background: boolean) => {
    if (busy.current || !callbacks.current.ready || !cloudSession()) return
    busy.current = true;setIsSyncing(true);setIsBlocking(!background);setError('');setStatus(background ? '自動アップロード中…' : '同期中…')
    try {
      if (!background) await callbacks.current.prepare()
      setStatus(await syncCloud(background))
    } catch (e) {
      setError(e instanceof Error ? e.message : '同期に失敗しました');setStatus('未同期の変更は端末に保存されています')
    } finally {
      if (!background) await callbacks.current.refresh().catch(() => {})
      busy.current=false;setIsSyncing(false);setIsBlocking(false)
    }
  }, [])
  const handleSync = useCallback(() => runSync(false), [runSync])
  useEffect(() => {
    if (!ready || !user) return
    let timer: ReturnType<typeof setTimeout>
    const upload = () => {
      if (busy.current) { timer = setTimeout(upload, 5000); return }
      lastAuto.current = Date.now()
      void runSync(true)
    }
    const schedule = () => {
      clearTimeout(timer)
      // Wait for a pause in editing; never upload more than once per minute.
      timer = setTimeout(upload, Math.max(30000, 60000 - (Date.now() - lastAuto.current)))
    }
    window.addEventListener('tn-local-saved',schedule)
    window.addEventListener('online',schedule)
    // Login/startup restores other-device notes once; subsequent saves only upload.
    timer = setTimeout(() => void runSync(false), 2500)
    return () => { clearTimeout(timer);window.removeEventListener('tn-local-saved',schedule);window.removeEventListener('online',schedule) }
  }, [ready,user,runSync])
  const handleLogin = useCallback(async (username: string, password: string, register = false): Promise<string | null> => {
    try { setUser(await cloudLogin(username,password,register));setError('');return null }
    catch(e) { return e instanceof Error ? e.message : 'ログインに失敗しました' }
  }, [])
  const handleLogout = useCallback(async () => {
    if (busy.current) return
    await cloudLogout();setUser(null);setStatus('');setError('')
  }, [])
  return { user, isConnected:!!user, isSyncing, isBlocking, status, error, handleLogin, handleLogout, handleSync }
}
