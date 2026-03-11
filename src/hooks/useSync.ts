import { useState, useEffect, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Notebook } from '../types'

interface Profile {
  id: string
  display_name: string
}

export function useSync() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [defaultCalendarId, setDefaultCalendarId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    const init = async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await loadProfile(session.user.id)
      }
    }
    init()

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
        setDefaultCalendarId(null)
        setIsConnected(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId: string) => {
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      setProfile(data)
      // デフォルトのカレンダーを取得（個人カレンダーの最初のもの）
      const { data: calendars } = await supabase
        .from('calendars')
        .select('id')
        .eq('owner_id', userId)
        .limit(1)
      if (calendars && calendars.length > 0) {
        setDefaultCalendarId(calendars[0].id)
      }
      setIsConnected(true)
    }
  }

  const handleLogin = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabaseが設定されていません'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])

  const handleLogout = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setDefaultCalendarId(null)
    setIsConnected(false)
  }, [])

  // ノート保存時にnote_recordsへ同期
  const syncNoteRecord = useCallback(async (notebook: Notebook, pageIndex: number) => {
    if (!supabase || !user || !defaultCalendarId) return

    const page = notebook.pages[pageIndex]
    if (!page || !page.content.trim()) return

    const contentPreview = page.content.slice(0, 100)

    await supabase
      .from('note_records')
      .upsert({
        user_id: user.id,
        calendar_id: defaultCalendarId,
        notebook_id: notebook.id,
        notebook_title: notebook.title,
        page_number: page.pageNumber,
        content_preview: contentPreview,
        recorded_at: page.lastModified,
        synced_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,notebook_id,page_number',
      })
  }, [user, defaultCalendarId])

  return {
    user, profile, isConnected,
    supabaseAvailable: !!supabase,
    handleLogin, handleLogout, syncNoteRecord,
  }
}
