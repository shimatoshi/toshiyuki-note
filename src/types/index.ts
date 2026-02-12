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
  currentPage: number; // 0-based index or 1-based page number? Specification says pageNumber starts at 1. Let's use 1-based for UI consistency.
  pages: Page[];
}
