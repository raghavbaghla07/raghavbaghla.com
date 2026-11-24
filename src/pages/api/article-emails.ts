import { getSecret } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { deliverArticleEmails, emailConfigured, privateResponseHeaders, subscriptionClient } from '../../lib/email-subscriptions';

const forbidden = () => new Response(null, { status: 403, headers: privateResponseHeaders });

async function dispatch(site: URL | undefined) {
  const client = subscriptionClient();
  if (!emailConfigured() || !client || !site) return new Response(null, { status: 503, headers: privateResponseHeaders });
  try {
    return Response.json(await deliverArticleEmails(site, client), { headers: privateResponseHeaders });
  } catch {
    console.error('Could not process the article email queue');
    return new Response(null, { status: 503, headers: privateResponseHeaders });
  }
}

export const GET: APIRoute = ({ request, site }) => {
  const secret = getSecret('CRON_SECRET');
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) return forbidden();
  return dispatch(site);
};

export const POST: APIRoute = async ({ request, site }) => {
  const authorization = request.headers.get('authorization');
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!authorization?.startsWith('Bearer ') || !url || !key) return forbidden();
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc('rb_is_owner');
  if (error || data !== true) return forbidden();
  return dispatch(site);
};
