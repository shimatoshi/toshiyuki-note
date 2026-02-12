export interface Page {
  pageNumber: number;
  content: string;
  lastModified: string; // ISO 8601
}

export interface Notebook {
  id: string;
  title: string;
  createdAt: string;
  currentPage: number; // 0-based index or 1-based page number? Specification says pageNumber starts at 1. Let's use 1-based for UI consistency.
  pages: Page[];
}
