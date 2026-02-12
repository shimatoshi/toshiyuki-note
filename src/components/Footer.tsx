import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, Paperclip, MapPin } from 'lucide-react'

interface FooterProps {
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  onAddAttachment: (e: React.ChangeEvent<HTMLInputElement>) => void
  isNextDisabled: boolean
}

export const Footer: React.FC<FooterProps> = ({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  onAddAttachment,
  isNextDisabled
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <footer className="footer">
      <div className="footer-left">
         <div className="page-indicator-footer">
           {currentPage} / {totalPages}
         </div>
      </div>

      <div className="footer-center">
         <input 
           type="file" 
           ref={fileInputRef} 
           style={{ display: 'none' }} 
           accept="image/*"
           onChange={(e) => {
             onAddAttachment(e)
             if (fileInputRef.current) fileInputRef.current.value = ''
           }}
         />
         <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
           <Paperclip size={20} />
         </button>
         {/* Placeholder for Location */}
         {/* <button className="icon-btn disabled"><MapPin size={20} /></button> */}
      </div>

      <div className="nav-buttons">
        <button 
          className="nav-btn" 
          disabled={currentPage === 1}
          onClick={onPrevPage}
        >
          <ChevronLeft size={24} />
        </button>
        
        <button 
          className="nav-btn"
          disabled={isNextDisabled} 
          onClick={onNextPage}
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </footer>
  )
}
