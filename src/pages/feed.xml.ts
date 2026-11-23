import type { APIRoute } from 'astro';
import { createPublicClient } from '../lib/supabase';
import { excerpt } from '../lib/studio-content';

const xml = (value: string) => value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const GET: APIRoute = async ({ url, site }) => {
  const client = createPublicClient();
  const token = url.searchParams.get('subscription');
  const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const unavailable = () => new Response('Feed temporarily unavailable', { status: 503, headers });
  if (!client) return unavailable();
  if (token !== null) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token)) return new Response(null, { status: 404, headers });
    const { data, error } = await client.rpc('rb_feed', { p_token: token, p_action: 'read' });
    if (error) return unavailable();
    if (!data) return new Response('Subscription ended', { status: 410, headers });
  }
  const { data, error } = await client.from('rb_posts').select('id,slug,title,body,published_at,summary:article->>summary')
    .order('published_at', { ascending: false }).limit(50);
  if (error) return unavailable();
  const archive = new URL('/writing/', site).href;
  const items = data.map(post => `<item><title>${xml(post.title)}</title><link>${xml(archive + encodeURIComponent(post.slug) + '/')}</link><guid isPermaLink="false">${post.id}</guid><pubDate>${new Date(post.published_at).toUTCString()}</pubDate><description>${xml(post.summary || excerpt(post.body))}</description></item>`);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>The Afterthoughts · Raghav Baghla</title><link>${xml(archive)}</link><description>New writing by Raghav Baghla</description>${items.join('')}</channel></rss>`,
    { headers: { ...headers, 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
