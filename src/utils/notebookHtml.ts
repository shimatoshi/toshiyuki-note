import { v4 as uuidv4 } from 'uuid'
import { TOTAL_PAGES } from '../types'
import type { Notebook, Page, Attachment } from '../types'

// ============================================================
// としゆきノートの「自己完結HTMLバックアップ」入出力。
//
// 設計方針:
//  - 1冊 = 1つのHTML。ブラウザでそのまま閲覧できる（画像は本文中にインライン表示）。
//  - 画像/ファイルのバイナリは本文の <img>/<a> に data URI として1コピーだけ持つ（重複なし）。
//  - 復元用の構造情報は <script type="application/json" id="tn-data"> に埋め込む。
//    画像/ファイルのバイナリはJSONには入れず、復元時に本文のdata URIから id で引き当てる。
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// 添付を本文インライン要素に変換。data-att-id は復元時の引き当てキー。
async function attachmentToInlineHtml(att: Attachment): Promise<string> {
  const id = escapeHtml(att.id)
  if (att.type === 'image') {
    let src = ''
    if (att.data instanceof Blob) src = await blobToDataUrl(att.data)
    else if (typeof att.data === 'string') src = att.data
    return `<img class="tn-att" data-att-id="${id}" src="${src}" alt="${escapeHtml(att.name || 'image')}">`
  }
  if (att.type === 'file') {
    let href = ''
    if (att.data instanceof Blob) href = await blobToDataUrl(att.data)
    else if (typeof att.data === 'string') href = att.data
    const name = escapeHtml(att.name || 'file')
    return `<a class="tn-att tn-file" data-att-id="${id}" href="${href}" download="${name}">📎 ${name}</a>`
  }
  if (att.type === 'location') {
    const d = att.data as { latitude?: number; longitude?: number } | undefined
    const url = (d?.latitude != null && d?.longitude != null)
      ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
      : '#'
    return `<a class="tn-att tn-loc" data-att-id="${id}" href="${url}" target="_blank" rel="noopener">📍 ${escapeHtml(att.name || 'location')}</a>`
  }
  return ''
}

// 本文テキストをHTML化し、(画像N)/(ファイルN)/(現在地N) を実体に展開する。
async function renderPageBody(page: Page): Promise<string> {
  const atts = page.attachments || []
  const inline = await Promise.all(atts.map(attachmentToInlineHtml))

  let html = escapeHtml(page.content)
  html = html.replace(/[(（](?:画像|ファイル|現在地)(\d+)[)）]/g, (m, numStr) => {
    const idx = parseInt(numStr, 10) - 1
    return idx >= 0 && idx < inline.length ? inline[idx] : m
  })
  html = html.replace(/\n/g, '<br>\n')
  return html
}

// 復元用の構造情報。画像/ファイルのバイナリは含めない（本文側に1コピー持つ）。
// 容量を抑えるため、内容のあるページのみを sparse に保持し pageNumber で位置を保つ。
function buildRestoreData(notebook: Notebook) {
  return {
    v: 1,
    id: notebook.id,
    title: notebook.title,
    createdAt: notebook.createdAt,
    currentPage: notebook.currentPage,
    showLines: notebook.showLines,
    backgroundUri: notebook.backgroundUri,
    pages: notebook.pages
      .filter(p => (p.content && p.content.trim().length > 0) || (p.attachments && p.attachments.length > 0))
      .map(p => ({
        pageNumber: p.pageNumber,
        content: p.content,
        lastModified: p.lastModified,
        attachments: (p.attachments || []).map(a => ({
          id: a.id,
          type: a.type,
          name: a.name,
          mimeType: a.mimeType,
          createdAt: a.createdAt,
          // location のみデータを保持。image/file は本文の data URI から復元する。
          data: a.type === 'location' ? a.data : undefined,
        })),
      })),
  }
}

const HTML_STYLE = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 800px; margin: 0 auto; padding: 24px 16px; color: #222; line-height: 1.7; background: #fff; }
  header { border-bottom: 2px solid #333; margin-bottom: 24px; padding-bottom: 12px; }
  header h1 { margin: 0 0 4px; font-size: 1.6rem; }
  .tn-meta { color: #888; font-size: 0.8rem; margin: 0; }
  .tn-page { margin: 0 0 32px; }
  .tn-page h2 { font-size: 0.95rem; color: #999; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  .tn-body { white-space: normal; word-break: break-word; }
  .tn-att { display: block; margin: 8px 0; }
  img.tn-att { max-width: 100%; height: auto; border-radius: 6px; }
  a.tn-att { color: #6200ee; text-decoration: none; }
`

// 1冊 → 自己完結HTML文字列
export async function notebookToHtml(notebook: Notebook): Promise<string> {
  const pagesHtml: string[] = []
  for (const page of notebook.pages) {
    const hasContent = (page.content && page.content.trim().length > 0) || (page.attachments && page.attachments.length > 0)
    if (!hasContent) continue
    const body = await renderPageBody(page)
    pagesHtml.push(`<section class="tn-page"><h2>Page ${page.pageNumber}</h2><div class="tn-body">${body}</div></section>`)
  }

  // </script> による早期終了を防ぐため < をエスケープ
  const json = JSON.stringify(buildRestoreData(notebook)).replace(/</g, '\\u003c')
  const title = escapeHtml(notebook.title)

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<header><h1>${title}</h1><p class="tn-meta">としゆきノート バックアップ</p></header>
<main>
${pagesHtml.join('\n')}
</main>
<script type="application/json" id="tn-data">${json}</script>
</body>
</html>`
}

// 自己完結HTML → Notebook（復元）。tn-data が無ければ null。
export function htmlToNotebook(html: string): Notebook | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const script = doc.getElementById('tn-data')
    if (!script || !script.textContent) return null

    const data = JSON.parse(script.textContent)
    if (!data || !Array.isArray(data.pages)) return null

    const now = new Date().toISOString()
    const maxPage = data.pages.reduce((mx: number, p: { pageNumber?: number }) => Math.max(mx, p.pageNumber || 0), 0)
    const totalPages = Math.max(TOTAL_PAGES, maxPage)

    // 空ページで埋めた配列に、pageNumber 位置で内容を差し込む
    const pages: Page[] = Array.from({ length: totalPages }, (_, i) => ({
      pageNumber: i + 1,
      content: '',
      lastModified: now,
    }))

    for (const p of data.pages) {
      const idx = (p.pageNumber || 0) - 1
      if (idx < 0 || idx >= pages.length) continue

      const attachments: Attachment[] = (p.attachments || []).map((a: {
        id: string; type: Attachment['type']; name?: string; mimeType?: string; createdAt?: string; data?: unknown
      }) => {
        const att: Attachment = {
          id: uuidv4(),
          type: a.type,
          name: a.name,
          mimeType: a.mimeType,
          createdAt: a.createdAt || now,
          data: '',
        }
        if (a.type === 'location') {
          att.data = (a.data as object) || {}
        } else {
          // 本文の data URI から元 id で引き当てる
          const el = doc.querySelector(`[data-att-id="${a.id}"]`)
          const dataUrl = el?.getAttribute('src') || el?.getAttribute('href') || ''
          att.data = dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : new Blob()
        }
        return att
      })

      pages[idx] = {
        pageNumber: p.pageNumber,
        content: p.content || '',
        lastModified: p.lastModified || now,
        attachments: attachments.length ? attachments : undefined,
      }
    }

    return {
      id: uuidv4(),
      title: data.title || 'インポートしたノート',
      createdAt: data.createdAt || now,
      currentPage: 1,
      pages,
      backgroundUri: data.backgroundUri,
      showLines: data.showLines,
    }
  } catch (e) {
    console.error('htmlToNotebook error', e)
    return null
  }
}
