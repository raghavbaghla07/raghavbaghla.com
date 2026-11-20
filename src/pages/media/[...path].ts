import type { APIRoute } from 'astro';
import { createPublicClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? '';
  // The anonymous client's Storage policies check published references on every request.
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|jpeg|png)$/.test(path)) return new Response('Not found',{status:404});
  const client = createPublicClient();
  if (!client) return new Response('Unavailable',{status:503});
  try {
    const {data,error} = await client.storage.from('rb-studio-images').download(path);
    if (error || !data) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const types: Record<string,string> = {webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
    const type = types[path.split('.').pop()!]!;
    return new Response(await data.arrayBuffer(), {headers:{
      'Content-Type':type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; sandbox",
    }});
  } catch { return new Response('Unavailable',{status:503,headers:{'Cache-Control':'no-store'}}); }
};
