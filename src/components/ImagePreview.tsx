import React from 'react'
import { X, Trash2, File, MapPin } from 'lucide-react'
import type { Attachment } from '../types'

interface ImagePreviewProps {
  attachment: Attachment | null
  onClose: () => void
  onDelete: (id: string) => void
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ attachment, onClose, onDelete }) => {
  if (!attachment) return null

  const getImageUrl = (data: Blob) => {
    return URL.createObjectURL(data)
  }

  const renderContent = () => {
    if (attachment.type === 'image') {
      return <img src={getImageUrl(attachment.data as Blob)} alt="Preview" />
    } else if (attachment.type === 'location') {
      const { latitude, longitude } = attachment.data as any
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      return (
        <div style={{ color: '#fff', textAlign: 'center' }}>
          <MapPin size={64} style={{ marginBottom: 16 }} />
          <h3>位置情報</h3>
          <p>Lat: {latitude}</p>
          <p>Lng: {longitude}</p>
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#bb86fc', display: 'block', marginTop: 16 }}>
            Google Mapsで開く
          </a>
        </div>
      )
    } else {
      return (
        <div style={{ color: '#fff', textAlign: 'center' }}>
          <File size={64} style={{ marginBottom: 16 }} />
          <h3>{attachment.name}</h3>
          <p>Type: {attachment.mimeType || 'Unknown'}</p>
        </div>
      )
    }
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-content" onClick={(e) => e.stopPropagation()}>
         {renderContent()}
         <button className="preview-close" onClick={onClose}><X size={24} /></button>
         <button className="preview-delete" onClick={() => onDelete(attachment.id)}>
           <Trash2 size={24} /> 削除
         </button>
      </div>
    </div>
  )
}
