import type { PostImage } from './studio-content';
/** A recovery export must never normalize or reject the user's working content. */
export function createArticleBackup(value: {
    title: string;
    body: string;
    article: unknown;
    images: PostImage[];
}): string {
    return JSON.stringify({ format: 'raghav-article-backup', saved: false, exportedAt: new Date().toISOString(), ...value }, null, 2);
}
