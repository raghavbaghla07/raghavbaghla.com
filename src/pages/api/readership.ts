import type { APIRoute } from 'astro';
import { createPublicClient } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response(null, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 415 });
  const client = createPublicClient();
  if (!client) return new Response(null, { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const { id, visitor, page, post, seconds, depth, source, click, destination } = JSON.parse(raw);
    const { error } = await client.rpc('rb_visit', {
      p_id:id, p_visitor:visitor, p_page:page, p_post:post, p_seconds:seconds,
      p_depth:depth, p_source:source, p_click:click, p_destination:destination,
    });
    return new Response(null, { status: error ? 400 : 204 });
  } catch { return new Response(null, { status: 400 }); }
};
