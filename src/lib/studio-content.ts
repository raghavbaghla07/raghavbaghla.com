export type PostImage = { path: string; alt: string };
import type { ArticleContent } from './article';
export type DraftInput = { title: string; body: string; images: PostImage[]; article?: ArticleContent | null };
export type Draft = DraftInput & { id: string; revision: number; created_at: string; updated_at: string };
export type PublishedPost = DraftInput & { id: string; slug: string; published_at: string; updated_at: string };

export function validateDraft(value: DraftInput): string | null {
  if (!value.title.trim() && !value.body.trim() && !value.images.length) return 'Write something before saving.';
  if (Array.from(value.title).length > 160) return 'Keep the title within 160 characters.';
  if (Array.from(value.body).length > 100000) return 'Keep the article within 100,000 characters.';
  if (value.images.length > 20) return 'Choose up to twenty images.';
  if (value.article && new TextEncoder().encode(JSON.stringify(value.article)).length > 1000000) return 'This article has too much formatting. Keep the article document under 1 MB.';
  if (value.images.some(image => Array.from(image.alt).length > 300)) return 'Keep image descriptions within 300 characters.';
  return null;
}

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG, or WebP image.';
  if (!file.size) return 'This image is empty.';
  if (file.size > 8 * 1024 * 1024) return 'Choose an image under 8 MB.';
  return null;
}

export function excerpt(body: string, limit = 180): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

export function readableError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.';
  if (/conflict/i.test(message)) return 'This draft changed in another tab. Copy your current text, then reopen the saved draft.';
  if (/jwt|token.*expired|not authenticated/i.test(message)) return 'Your session expired. Copy your current text, then sign in again.';
  if (/not.*owner|permission|unauthorized|row.level security/i.test(message)) return 'Your account does not have permission for this action.';
  return message;
}
