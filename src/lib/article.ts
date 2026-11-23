import type { PostImage } from './studio-content';

export type ArticleNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: ArticleNode[];
};
export type ArticleContent = { version: 1; doc: ArticleNode; summary: string; tags: string[]; cover: string | null };

const MAX_TEXT = 100_000;
const MAX_NODES = 10_000;
const MAX_DEPTH = 32;
const marks = new Set(['superscript', 'subscript', 'bold', 'italic', 'underline', 'strike', 'highlight', 'code', 'link']);
const blocks = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'table', 'articleImage']);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clipped = (value: unknown, limit: number) => typeof value === 'string' ? Array.from(value).slice(0, limit).join('') : '';
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Check the original editor tree before normalization can discard over-limit work. */
export function validateArticleDocument(doc: unknown): string | null {
  if (!record(doc) || doc.type !== 'doc') return 'This article document is invalid. Export your work before reopening it.';
  const pending: { value: unknown; depth: number }[] = [{ value: doc, depth: 0 }];
  const seen = new WeakSet<object>();
  let count = 0; let characters = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (!record(value) || seen.has(value)) return 'This article document is invalid. Export your work before reopening it.';
    seen.add(value);
    if (++count > MAX_NODES) return 'This article has more than 10,000 document elements. Split it into smaller articles before saving; your current work is preserved.';
    if (depth > MAX_DEPTH) return 'This article has more than 32 levels of nesting. Reduce nested lists, quotes, or tables before saving; your current work is preserved.';
    if (typeof value.text === 'string') {
      for (const _character of value.text) {
        if (++characters > MAX_TEXT) return 'Keep article text within 100,000 characters before saving; your current work is preserved.';
      }
    }
    if (Array.isArray(value.content)) {
      if (count + pending.length + value.content.length > MAX_NODES) return 'This article has more than 10,000 document elements. Split it into smaller articles before saving; your current work is preserved.';
      for (let index = value.content.length - 1; index >= 0; index--) pending.push({ value: value.content[index], depth: depth + 1 });
    }
  }
  return null;
}

/** Reject protocols and control characters that browsers can reinterpret. */
export function safeLink(value: string): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  if (!/^(https?:\/\/|mailto:)/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'mailto:') return url.pathname && !/%0[ad]/i.test(value) ? value : null;
    return url.hostname && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function legacyToDoc(body: string): ArticleNode {
  const text = clipped(body, MAX_TEXT).replace(/\r\n?/g, '\n');
  return { type: 'doc', content: text.split('\n\n').map(paragraph => ({
    type: 'paragraph', content: paragraph.split('\n').flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : []),
    ]),
  })) };
}

export function normalizeArticle(value: unknown, body: string, images: PostImage[]): ArticleContent {
  const fallback = (): ArticleContent => ({ version: 1, doc: legacyToDoc(body), summary: '', tags: [], cover: null });
  try {
    if (typeof value === 'string') { if (value.length > 1_048_576) return fallback(); value = JSON.parse(value); }
    if (!record(value) || value.version !== 1 || !record(value.doc) || value.doc.type !== 'doc') return fallback();
    // Check the entire input before walking; cyclic objects and oversized metadata fail closed.
    const serialized = JSON.stringify(value);
    if (!serialized || new TextEncoder().encode(serialized).length > 1_048_576) return fallback();
    const paths = new Set(images.slice(0, 20).map(image => image.path));
    let nodes = 0; let remaining = MAX_TEXT;
    function node(input: unknown, parent: string, depth: number): ArticleNode | null {
      if (depth > MAX_DEPTH || ++nodes > MAX_NODES || !record(input) || typeof input.type !== 'string') return null;
      const type = input.type;
      const inline = parent === 'paragraph' || parent === 'heading';
      const allowed = parent === 'doc' || parent === 'blockquote' || parent === 'listItem' || parent === 'tableCell' || parent === 'tableHeader'
        ? blocks.has(type)
        : inline ? type === 'text' || type === 'hardBreak'
        : parent === 'codeBlock' ? type === 'text'
        : parent === 'bulletList' || parent === 'orderedList' ? type === 'listItem'
        : parent === 'table' ? type === 'tableRow'
        : parent === 'tableRow' ? type === 'tableCell' || type === 'tableHeader' : false;
      if (!allowed) return null;
      const result: ArticleNode = { type };
      const attrs = record(input.attrs) ? input.attrs : {};
      if (type === 'text') {
        result.text = clipped(input.text, remaining); remaining -= Array.from(result.text).length;
        if (!result.text) return null;
        if (parent !== 'codeBlock' && Array.isArray(input.marks)) {
          result.marks = [];
          for (const mark of input.marks.slice(0, 16)) {
            if (!record(mark) || typeof mark.type !== 'string' || !marks.has(mark.type) || result.marks.some(item => item.type === mark.type)) continue;
            if (mark.type === 'link') {
              const href = record(mark.attrs) && typeof mark.attrs.href === 'string' ? safeLink(mark.attrs.href) : null;
              if (href) result.marks.push({ type: 'link', attrs: { href } });
            } else result.marks.push({ type: mark.type });
          }
          if (!result.marks.length) delete result.marks;
        }
        return result;
      }
      if (type === 'articleImage') {
        if (typeof attrs.path !== 'string' || !paths.has(attrs.path)) return null;
        result.attrs = { path: attrs.path, alt: clipped(attrs.alt ?? images.find(image => image.path === attrs.path)?.alt, 300), caption: clipped(attrs.caption, 500) };
        return result;
      }
      if (type === 'heading') result.attrs = { level: [2, 3, 4].includes(Number(attrs.level)) ? Number(attrs.level) : 2 };
      if (type === 'orderedList') result.attrs = { start: typeof attrs.start === 'number' && Number.isInteger(attrs.start) && attrs.start > 0 && attrs.start < 1_000_000 ? attrs.start : 1 };
      if (type === 'codeBlock') result.attrs = { language: typeof attrs.language === 'string' && /^[a-zA-Z0-9_+#.-]{1,40}$/.test(attrs.language) ? attrs.language : null };
      if (type === 'tableCell' || type === 'tableHeader') result.attrs = {
        colspan: typeof attrs.colspan === 'number' && Number.isInteger(attrs.colspan) ? Math.max(1, Math.min(20, attrs.colspan)) : 1,
        rowspan: typeof attrs.rowspan === 'number' && Number.isInteger(attrs.rowspan) ? Math.max(1, Math.min(100, attrs.rowspan)) : 1,
      };
      if (type !== 'hardBreak' && type !== 'horizontalRule') result.content = Array.isArray(input.content)
        ? input.content.slice(0, MAX_NODES).map(child => node(child, type, depth + 1)).filter((child): child is ArticleNode => child !== null) : [];
      return result;
    }
    const doc: ArticleNode = { type: 'doc', content: Array.isArray(value.doc.content) ? value.doc.content.slice(0, MAX_NODES).map(child => node(child, 'doc', 1)).filter((child): child is ArticleNode => child !== null) : [] };
    const tags = Array.isArray(value.tags) ? [...new Set(value.tags.slice(0, 100).map(tag => clipped(tag, 40).trim()).filter(Boolean))].slice(0, 8) : [];
    return { version: 1, doc, summary: clipped(value.summary, 320).trim(), tags, cover: typeof value.cover === 'string' && paths.has(value.cover) ? value.cover : null };
  } catch { return fallback(); }
}

/** A bounded readable representation for search, counts, and the legacy body column. */
export function articleText(doc: ArticleNode): string {
  let count = 0;
  function text(node: ArticleNode, depth: number): string {
    if (!node || depth > MAX_DEPTH || ++count > MAX_NODES) return '';
    if (node.type === 'text') return clipped(node.text, MAX_TEXT);
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'articleImage') return clipped(node.attrs?.caption, 500);
    const children = Array.isArray(node.content) ? node.content.slice(0, MAX_NODES).map(child => text(child, depth + 1)) : [];
    const separator = ['doc', 'blockquote', 'listItem', 'tableCell', 'tableHeader'].includes(node.type) ? '\n\n' : ['bulletList', 'orderedList', 'table'].includes(node.type) ? '\n' : node.type === 'tableRow' ? '\t' : '';
    return children.join(separator).slice(0, MAX_TEXT);
  }
  return text(doc, 0).slice(0, MAX_TEXT);
}

/** Render only normalized schema; the resolver cannot introduce executable URLs. */
export function renderArticle(article: ArticleContent, images: PostImage[], resolveImage: (path: string) => string): string {
  const normalized = normalizeArticle(article, '', images);
  function render(node: ArticleNode): string {
    const content = () => (node.content ?? []).map(render).join('');
    const attrs = node.attrs ?? {};
    if (node.type === 'text') {
      let html = escape(node.text ?? '');
      for (const mark of node.marks ?? []) {
        const tag = ({ superscript: 'sup', subscript: 'sub', bold: 'strong', italic: 'em', underline: 'u', strike: 's', highlight: 'mark', code: 'code' } as Record<string, string>)[mark.type];
        if (tag) html = `<${tag}>${html}</${tag}>`;
        else if (mark.type === 'link') html = `<a href="${escape(String(mark.attrs?.href))}" rel="noopener noreferrer">${html}</a>`;
      }
      return html;
    }
    if (node.type === 'doc') return content();
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'articleImage') {
      let url: string;
      try { url = resolveImage(String(attrs.path)); } catch { return ''; }
      if (typeof url !== 'string' || !(url.startsWith('/') && !/^\/[\/\\]/.test(url) && !/[\u0000-\u0020\u007f\\]/.test(url) || /^https?:\/\//i.test(url) && safeLink(url))) return '';
      return `<figure><img src="${escape(url)}" alt="${escape(String(attrs.alt ?? ''))}" loading="lazy" decoding="async">${attrs.caption ? `<figcaption>${escape(String(attrs.caption))}</figcaption>` : ''}</figure>`;
    }
    if (node.type === 'codeBlock') return `<pre${attrs.language ? ` data-language="${escape(String(attrs.language))}"` : ''}><code>${content()}</code></pre>`;
    const tag = node.type === 'heading' ? `h${attrs.level}` : ({ paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', table: 'table', tableRow: 'tr', tableCell: 'td', tableHeader: 'th' } as Record<string, string>)[node.type];
    if (!tag) return '';
    const extra = node.type === 'orderedList' && attrs.start !== 1 ? ` start="${attrs.start}"` : node.type === 'tableCell' || node.type === 'tableHeader' ? ` colspan="${attrs.colspan}" rowspan="${attrs.rowspan}"` : '';
    return `<${tag}${extra}>${content()}</${tag}>`;
  }
  return render(normalized.doc);
}

export function articleStats(text: string): { words: number; characters: number; minutes: number } {
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return { words, characters: Array.from(text).length, minutes: words ? Math.ceil(words / 200) : 0 };
}
