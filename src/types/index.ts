export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'location';
  data: Blob | string | object; // Blob for files, string/object for others
  name?: string; // filename
  mimeType?: string;
  createdAt: string;
}

export interface Page {
  pageNumber: number;
  content: string;
  lastModified: string; // ISO 8601
  attachments?: Attachment[]; // Optional for backward compatibility
}

export interface NotebookMetadata {
  id: string;
  title: string;
  createdAt: string;
  lastModified: string;
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
  currentPage: number;
  pages: Page[];
  backgroundUri?: string; // Data URI for background image
  showLines?: boolean;    // Toggle ruled lines
}
