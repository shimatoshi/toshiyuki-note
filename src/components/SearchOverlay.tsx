import React from 'react'
import { Search, X } from 'lucide-react'

interface SearchResult {
  notebookId: string
  title: string
  pageNumber: number
  snippet: string
}

interface SearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  onSearch: (e: React.FormEvent) => void
  onClear: () => void
  isSearching: boolean
  results: SearchResult[]
  onJumpToResult: (notebookId: string, pageNumber: number) => void
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  query,
  onQueryChange,
  onSearch,
  onClear,
  isSearching,
  results,
  onJumpToResult
}) => {
  if (!isOpen) return null

  return (
    <div className="search-overlay">
      <div className="search-header">
        <form onSubmit={onSearch} className="search-bar">
          <Search size={20} className="search-icon" />
          <input 
            type="text" 
            placeholder="全ノート検索..." 
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="clear-btn" onClick={onClear}>
              <X size={16} />
            </button>
          )}
        </form>
        <button className="close-btn" onClick={onClose}>
          キャンセル
        </button>
      </div>
      
      <div className="search-results">
        {isSearching ? (
          <div className="searching-indicator">検索中...</div>
        ) : results.length > 0 ? (
          <ul>
            {results.map((result, idx) => (
              <li key={`${result.notebookId}-${result.pageNumber}-${idx}`} onClick={() => onJumpToResult(result.notebookId, result.pageNumber)}>
                <div className="result-meta">
                  <span className="result-title">{result.title}</span>
                  <span className="result-page">P.{result.pageNumber}</span>
                </div>
                <div className="result-snippet">{result.snippet}</div>
              </li>
            ))}
          </ul>
        ) : query && !isSearching ? (
           <div className="no-results">見つかりませんでした</div>
        ) : null}
      </div>
    </div>
  )
}
