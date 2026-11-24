import type { APIRoute } from 'astro';
import { createPublicClient } from '../../lib/supabase';
import { excerpt } from '../../lib/studio-content';
import type { PublishedPost } from '../../lib/studio-content';

export const GET: APIRoute = async () => {
  const headers = {'Cache-Control':'no-store'};
  const client = createPublicClient();
  if (!client) return Response.json({hasPosts:false},{headers});
  try {
    const result = await client.from('rb_posts')
      .select('slug,title,body,published_at,summary:article->>summary')
      .order('published_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(3);
    if (result.error) return Response.json({hasPosts:false},{status:503,headers});
    const posts = (result.data as (Pick<PublishedPost, 'slug' | 'title' | 'body' | 'published_at'> & { summary: string | null })[]).map(post => ({
      href: `/writing/${encodeURIComponent(post.slug)}/`,
      title: post.title,
      summary: excerpt(post.summary?.trim() || post.body, 120),
      publishedAt: post.published_at,
    }));
    return Response.json({hasPosts: posts.length > 0, posts},{headers:{
      ...headers,
      'Vercel-CDN-Cache-Control': 'public, s-maxage=15',
    }});
  } catch { return Response.json({hasPosts:false},{status:503,headers}); }
};
