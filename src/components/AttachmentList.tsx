import React, { useMemo, useEffect } from 'react'
import type { Attachment } from '../types'
import { File, MapPin } from 'lucide-react'

interface AttachmentListProps {
  attachments: Attachment[]
  onPreview: (attachment: Attachment) => void
}

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, onPreview }) => {
  if (!attachments || attachments.length === 0) return null

  // ObjectURLをまとめて生成し、アンマウント時にrevokeする
  const imageUrls = useMemo(() => {
    const urls: Record<string, string> = {}
    attachments.forEach(att => {
      if (att.type === 'image' && att.data instanceof Blob) {
        urls[att.id] = URL.createObjectURL(att.data)
      }
    })
    return urls
  }, [attachments])

  useEffect(() => {
    return () => {
      Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url))
    }
  }, [imageUrls])

  return (
    <div className="attachments-area">
      {attachments.map((att, idx) => (
        <div key={att.id} className="attachment-item" onClick={() => onPreview(att)}>
          {att.type === 'image' ? (
            <>
              <img src={imageUrls[att.id]} alt="attachment" className="attachment-thumb" />
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
