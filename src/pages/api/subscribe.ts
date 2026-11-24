import { getSecret } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { optedOut } from '../../lib/readership';
import { validSubscriptionToken } from '../../lib/email-subscriptions';
import { createHash } from 'node:crypto';
import { emailConfigured, privateResponseHeaders, subscriptionClient } from '../../lib/email-subscriptions';

const emailPattern = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export const POST: APIRoute = async ({ request, url }) => {
  const respond = (status: string) => Response.redirect(new URL('/subscription/?status=' + status, url), 303);
  if (request.headers.get('origin') !== url.origin) return new Response(null, { status: 403, headers: privateResponseHeaders });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ||
      Number(request.headers.get('content-length')) > 2048) return respond('invalid');

  const client = subscriptionClient();
  if (!emailConfigured() || !client) return respond('unavailable');
  try {
    const fields = await request.formData();
    const topic = fields.get('topic');
    if (topic !== null && topic !== 'afterthoughts') return respond('invalid');
    const email = String(fields.get('email') ?? '').trim().toLowerCase();
    if (email.length > 254 || email.split('@')[0].length > 64 || !emailPattern.test(email)) return respond('invalid');

    const ip = request.headers.get('x-vercel-forwarded-for') ?? 'local';
    const sender = createHash('sha256').update(getSecret('CRON_SECRET') + ':' + ip).digest('hex');
    const visit = fields.get('visit'), visitor = fields.get('visitor');
    const attribute = !optedOut(request.headers) && validSubscriptionToken(visit) && validSubscriptionToken(visitor);
    const result = await client.rpc('rb_follow_afterthoughts', { p_email: email, p_sender: sender,
      p_visit: attribute ? visit : null, p_visitor: attribute ? visitor : null });
    if (result.error) throw result.error;
    return respond(result.data === true ? 'subscribed' : 'limited');
  } catch {
    console.error('Afterthoughts follow request failed');
    return respond('unavailable');
  }
};
