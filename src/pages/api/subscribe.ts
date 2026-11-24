import { getSecret } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { emailConfigured, privateResponseHeaders, sendEmail, subscriptionClient, subscriptionLink } from '../../lib/email-subscriptions';

const emailPattern = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export const POST: APIRoute = async ({ request, url, site }) => {
  const respond = (status: string) => Response.redirect(new URL('/subscription/?status=' + status, url), 303);
  if (request.headers.get('origin') !== url.origin) return new Response(null, { status: 403, headers: privateResponseHeaders });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ||
      Number(request.headers.get('content-length')) > 2048) return respond('invalid');

  const client = subscriptionClient();
  if (!emailConfigured() || !client || !site) return respond('unavailable');
  try {
    const fields = await request.formData();
    const email = String(fields.get('email') ?? '').trim().toLowerCase();
    if (email.length > 254 || email.split('@')[0].length > 64 || !emailPattern.test(email)) return respond('invalid');

    const ip = request.headers.get('x-vercel-forwarded-for') ?? 'local';
    const sender = createHash('sha256').update(getSecret('CRON_SECRET') + ':' + ip).digest('hex');
    const result = await client.rpc('rb_request_email_subscription', { p_email: email, p_sender: sender });
    if (result.error) throw result.error;
    if (result.data) {
      const link = subscriptionLink(site, 'confirm', result.data);
      await sendEmail(email, 'Confirm your subscription to The Afterthoughts',
        'Confirm your email address to receive new articles:\n\n' + link + '\n\nThis link expires in 24 hours.',
        'confirm/' + result.data);
    }
    return respond('requested');
  } catch {
    console.error('Newsletter signup failed');
    return respond('unavailable');
  }
};
