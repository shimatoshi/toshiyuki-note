import React from 'react'
import type { Attachment } from '../types'

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
          {att.type === 'image' && (
            <>
              <img src={getImageUrl(att.data as Blob)} alt="attachment" className="attachment-thumb" />
              <span className="attachment-badge">{idx + 1}</span>
            </>
          )}
          {/* Future support for other types */}
        </div>
      ))}
    </div>
  )
}
