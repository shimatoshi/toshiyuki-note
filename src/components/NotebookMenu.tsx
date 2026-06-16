import React, { useRef, useState } from 'react'
import { FileText, Trash2, Download, Upload, PlusCircle, Image as ImageIcon, Type, LogIn, LogOut, Cloud, FileCode, Archive, Database, ChevronLeft } from 'lucide-react'
import type { NotebookMetadata, Notebook } from '../types'

interface SyncInfo {
  isConnected: boolean
  profileName: string | null
  supabaseAvailable: boolean
  onLogin: (email: string, password: string) => Promise<string | null>
  onLogout: () => void
}

interface NotebookMenuProps {
  isOpen: boolean
  onClose: () => void
  notebooks: NotebookMetadata[]
  currentNotebook: Notebook | null
  onLoadNotebook: (id: string, targetPage?: number) => void
  onDeleteNotebook: (id: string) => void
  onCreateNotebook: () => void
  onDownloadZip: () => void
  onImportZip: (e: React.ChangeEvent<HTMLInputElement>) => void
  onExportHtml: () => void
  onExportAllHtml: () => void
  onUpdateNotebook: (notebook: Notebook, immediate?: boolean) => void
  sync?: SyncInfo
}

export const NotebookMenu: React.FC<NotebookMenuProps> = ({
  isOpen,
  onClose,
  notebooks,
  currentNotebook,
  onLoadNotebook,
  onDeleteNotebook,
  onCreateNotebook,
  onDownloadZip,
  onImportZip,
  onExportHtml,
  onExportAllHtml,
  onUpdateNotebook,
  sync
}) => {
  const bgInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  // メニュー内の表示画面: メイン / バックアップ
  const [view, setView] = useState<'main' | 'backup'>('main')

  if (!isOpen) return null

  const close = () => {
    setView('main')
    onClose()
  }

  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentNotebook || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const reader = new FileReader()
    reader.onload = () => {
      onUpdateNotebook({ ...currentNotebook, backgroundUri: reader.result as string }, true)
    }
    reader.readAsDataURL(file)
  }

  const toggleLines = () => {
    if (!currentNotebook) return
    onUpdateNotebook({ ...currentNotebook, showLines: !currentNotebook.showLines }, true)
  }

  const clearBg = () => {
    if (!currentNotebook) return
    onUpdateNotebook({ ...currentNotebook, backgroundUri: undefined }, true)
  }

  // バックアップ画面（エクスポート/インポートをここに集約）
  if (view === 'backup') {
    return (
      <div className="menu-overlay" onClick={close}>
        <div className="menu-content" onClick={(e) => e.stopPropagation()}>
          <h2 className="menu-title-back" onClick={() => setView('main')}>
            <ChevronLeft size={22} /> バックアップ
          </h2>

          <div className="menu-actions" style={{ flex: 1, overflowY: 'auto' }}>
            <h3 className="menu-section-label">エクスポート（書き出し）</h3>
            <button onClick={onExportHtml} className="action-btn">
              <FileCode size={20} /> HTMLで保存（このノート）
            </button>
            <button onClick={onExportAllHtml} className="action-btn">
              <Archive size={20} /> 全ノートをHTMLでバックアップ
            </button>
            <button onClick={onDownloadZip} className="action-btn">
              <Download size={20} /> ZIPで保存（旧形式）
            </button>

            <h3 className="menu-section-label" style={{ marginTop: 8 }}>インポート（取り込み・復元）</h3>
            <button onClick={() => importInputRef.current?.click()} className="action-btn">
              <Upload size={20} /> HTML / ZIPから復元
            </button>
            <p className="menu-hint">
              ↑で書き出したHTML / ZIPをここから読み込むと、ノートを丸ごと復元できます。
            </p>

            <input
              type="file"
              ref={importInputRef}
              onChange={(e) => {
                onImportZip(e)
                if (importInputRef.current) importInputRef.current.value = ''
              }}
              accept=".html,.htm,.zip"
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="menu-overlay" onClick={close}>
      <div className="menu-content" onClick={(e) => e.stopPropagation()}>
        <h2>メニュー</h2>

        <div className="notebook-list-container">
          <h3>ノート一覧</h3>
          <ul className="notebook-list">
            {notebooks.map(nb => (
              <li key={nb.id} className={currentNotebook && nb.id === currentNotebook.id ? 'active' : ''}>
                <div className="notebook-info" onClick={() => {
                  onLoadNotebook(nb.id)
                  onClose()
                }}>
                  <FileText size={16} />
                  <span className="notebook-title">{nb.title}</span>
                </div>
                {notebooks.length > 1 && (
                  <button className="delete-btn" onClick={(e) => {
                    e.stopPropagation()
                    onDeleteNotebook(nb.id)
                  }}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="menu-actions">
          <button onClick={onCreateNotebook} className="action-btn">
            <PlusCircle size={20} /> 新しいノートを作成
          </button>
          
          <button onClick={toggleLines} className="action-btn">
            <Type size={20} /> 罫線: {currentNotebook?.showLines ? 'ON' : 'OFF'}
          </button>
          
          <button onClick={() => bgInputRef.current?.click()} className="action-btn">
            <ImageIcon size={20} /> 背景画像を設定
          </button>
          
          {currentNotebook?.backgroundUri && (
            <button onClick={clearBg} className="action-btn" style={{ color: 'var(--danger-color)' }}>
              <Trash2 size={20} /> 背景を削除
            </button>
          )}

          <button onClick={() => setView('backup')} className="action-btn">
            <Database size={20} /> バックアップ（書き出し・復元）
          </button>

          <input
            type="file"
            ref={bgInputRef}
            onChange={handleBgChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>

        {sync?.supabaseAvailable && (
          <div className="menu-actions" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              としゆきアカウント
            </h3>
            {sync.isConnected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 14, color: 'var(--accent-color)' }}>
                  <Cloud size={16} /> {sync.profileName} (連携中)
                </div>
                <button onClick={sync.onLogout} className="action-btn" style={{ color: 'var(--danger-color)' }}>
                  <LogOut size={20} /> ログアウト
                </button>
              </>
            ) : showLogin ? (
              <form onSubmit={async (e) => {
                e.preventDefault()
                setLoginError(null)
                const err = await sync.onLogin(loginEmail, loginPassword)
                if (err) setLoginError(err)
                else { setShowLogin(false); setLoginEmail(''); setLoginPassword('') }
              }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="メールアドレス"
                  required
                  style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px', borderRadius: 6, fontSize: 16 }}
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="パスワード"
                  required
                  style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px', borderRadius: 6, fontSize: 16 }}
                />
                {loginError && <div style={{ color: 'var(--danger-color)', fontSize: 13 }}>{loginError}</div>}
                <button type="submit" className="action-btn" style={{ justifyContent: 'center' }}>
                  ログイン
                </button>
                <button type="button" onClick={() => setShowLogin(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                  キャンセル
                </button>
              </form>
            ) : (
              <button onClick={() => setShowLogin(true)} className="action-btn">
                <LogIn size={20} /> カレンダーと連携
              </button>
            )}
          </div>
        )}

        <div className="menu-footer">
          <p>Toshiyuki Note v2.0.0</p>
          <button 
            onClick={() => {
              if (window.confirm('キャッシュをクリアしてアプリを再起動しますか？')) {
                window.location.reload();
              }
            }}
            style={{ 
              background: 'none', 
              border: '1px solid #444', 
              color: '#888', 
              fontSize: '10px', 
              padding: '2px 8px', 
              marginTop: '5px',
              borderRadius: '4px'
            }}
          >
            アプリを強制更新
          </button>
          <p>&copy; 2026 Shimatoshi</p>
        </div>
      </div>
    </div>
  )
}
