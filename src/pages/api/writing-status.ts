import type { APIRoute } from 'astro';
import { createPublicClient } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  const headers = {'Cache-Control':'no-store'};
  const client = createPublicClient();
  if (!client) return Response.json({hasPosts:false},{headers});
  try {
    const result = await client.from('rb_posts').select('id').limit(1);
    if (result.error) return Response.json({hasPosts:false},{status:503,headers});
    return Response.json({hasPosts:Boolean(result.data?.length)},{headers});
  } catch { return Response.json({hasPosts:false},{status:503,headers}); }
};
