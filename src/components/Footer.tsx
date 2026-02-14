import React, { useRef } from 'react'
import { Paperclip, MapPin, FileUp, Clock, Search, Calendar } from 'lucide-react'

interface FooterProps {
  currentPage: number
  totalPages: number
  onAddAttachment: (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => void
  onAddTimestamp: () => void
  onAddLocation: () => void
  onToggleSearch: () => void
  onToggleCalendar: () => void
}

export const Footer: React.FC<FooterProps> = ({
  currentPage,
  totalPages,
  onAddAttachment,
  onAddTimestamp,
  onAddLocation,
  onToggleSearch,
  onToggleCalendar
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
         <button className="icon-btn" onClick={onToggleCalendar}>
           <Calendar size={24} />
         </button>
         <button className="icon-btn" onClick={onToggleSearch}>
           <Search size={24} />
         </button>

         <div className="v-divider" />

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
           <Paperclip size={24} />
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
           <FileUp size={24} />
         </button>

         <button className="icon-btn" onClick={onAddTimestamp}>
           <Clock size={24} />
         </button>
         
         <button className="icon-btn" onClick={onAddLocation}>
           <MapPin size={24} />
         </button>
      </div>
    </footer>
  )
}
