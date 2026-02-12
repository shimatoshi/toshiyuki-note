import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, Paperclip, MapPin, FileUp, Clock } from 'lucide-react'

interface FooterProps {
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  onAddAttachment: (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => void
  onAddTimestamp: () => void
  onAddLocation: () => void
  isNextDisabled: boolean
}

export const Footer: React.FC<FooterProps> = ({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  onAddAttachment,
  onAddTimestamp,
  onAddLocation,
  isNextDisabled
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null)
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
           ref={imageInputRef} 
           style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
           accept="image/*"
           onChange={(e) => {
             onAddAttachment(e, 'image')
             if (imageInputRef.current) imageInputRef.current.value = ''
           }}
         />
         <button className="icon-btn" onClick={() => imageInputRef.current?.click()}>
           <Paperclip size={20} />
         </button>

         <input 
           type="file" 
           ref={fileInputRef} 
           style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
           onChange={(e) => {
             onAddAttachment(e, 'file')
             if (fileInputRef.current) fileInputRef.current.value = ''
           }}
         />
         <button className="icon-btn" onClick={() => fileInputRef.current?.click()}>
           <FileUp size={20} />
         </button>

         <button className="icon-btn" onClick={onAddTimestamp}>
           <Clock size={20} />
         </button>
         
         <button className="icon-btn" onClick={onAddLocation}>
           <MapPin size={20} />
         </button>
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
