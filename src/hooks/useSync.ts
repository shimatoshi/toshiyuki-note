import { useState, useEffect, useCallback, useRef } from 'react'
import { cloudSession, cloudLogin, cloudLogout, syncCloud } from '../lib/cloud'

export function useSync(prepare: () => Promise<void>, refresh: () => Promise<void>, ready: boolean) {
  const [user, setUser] = useState(cloudSession()?.user ?? null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const callbacks = useRef({prepare,refresh,ready})
  useEffect(() => { callbacks.current = {prepare,refresh,ready} }, [prepare,refresh,ready])
  const handleSync = useCallback(async () => {
    if (busy.current || !callbacks.current.ready || !cloudSession()) return
    busy.current = true;setIsSyncing(true);setError('');setStatus('同期中…')
    try {
      await callbacks.current.prepare()
      setStatus(await syncCloud())
    } catch (e) {
      setError(e instanceof Error ? e.message : '同期に失敗しました');setStatus('未同期の変更は端末に保存されています')
    } finally {
      await callbacks.current.refresh().catch(() => {})
      busy.current=false;setIsSyncing(false)
    }
  }, [])
  useEffect(() => {
    if (!ready || !user) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => { clearTimeout(timer);timer=setTimeout(() => void handleSync(),2500) }
    // Local writes debounce uploads; reconnect and manual sync also pull other devices.
    window.addEventListener('tn-local-saved',schedule)
    window.addEventListener('online',schedule)
    schedule()
    return () => { clearTimeout(timer);window.removeEventListener('tn-local-saved',schedule);window.removeEventListener('online',schedule) }
  }, [ready,user,handleSync])
  const handleLogin = useCallback(async (username: string, password: string, register = false): Promise<string | null> => {
    try { setUser(await cloudLogin(username,password,register));setError('');return null }
    catch(e) { return e instanceof Error ? e.message : 'ログインに失敗しました' }
  }, [])
  const handleLogout = useCallback(async () => {
    if (busy.current) return
    await cloudLogout();setUser(null);setStatus('');setError('')
  }, [])
  return { user, isConnected:!!user, isSyncing, status, error, handleLogin, handleLogout, handleSync }
}
