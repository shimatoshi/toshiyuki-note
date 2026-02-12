import React from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Attachment } from '../types'

interface ImagePreviewProps {
  attachment: Attachment | null
  onClose: () => void
  onDelete: (id: string) => void
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ attachment, onClose, onDelete }) => {
  if (!attachment || attachment.type !== 'image') return null

  const getImageUrl = (data: Blob) => {
    return URL.createObjectURL(data)
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-content" onClick={(e) => e.stopPropagation()}>
         <img src={getImageUrl(attachment.data as Blob)} alt="Preview" />
         <button className="preview-close" onClick={onClose}><X size={24} /></button>
         <button className="preview-delete" onClick={() => onDelete(attachment.id)}>
           <Trash2 size={24} /> 削除
         </button>
      </div>
    </div>
  )
}
