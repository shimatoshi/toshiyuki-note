import React from 'react'
import type { Attachment } from '../types'
import { File, MapPin } from 'lucide-react'

interface AttachmentListProps {
  attachments: Attachment[]
  onPreview: (attachment: Attachment) => void
}

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, onPreview }) => {
  if (!attachments || attachments.length === 0) return null

  const getImageUrl = (data: Blob) => {
    return URL.createObjectURL(data)
  }

  return (
    <div className="attachments-area">
      {attachments.map((att, idx) => (
        <div key={att.id} className="attachment-item" onClick={() => onPreview(att)}>
          {att.type === 'image' ? (
            <>
              <img src={getImageUrl(att.data as Blob)} alt="attachment" className="attachment-thumb" />
              <span className="attachment-badge">{idx + 1}</span>
            </>
          ) : att.type === 'location' ? (
            <div className="attachment-file">
              <MapPin size={32} />
              <span className="attachment-filename">Location</span>
              <span className="attachment-badge">{idx + 1}</span>
            </div>
          ) : (
            <div className="attachment-file">
              <File size={32} />
              <span className="attachment-filename">{att.name}</span>
              <span className="attachment-badge">{idx + 1}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
