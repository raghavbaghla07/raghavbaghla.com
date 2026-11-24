import { getSecret } from 'astro:env/server';
import { createClient } from '@supabase/supabase-js';
import { setTimeout as delay } from 'node:timers/promises';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;

export const privateResponseHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};

export function subscriptionClient() {
  const key = getSecret('SUPABASE_SECRET_KEY');
  if (!key || !supabaseUrl) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function emailConfigured() {
  return Boolean(supabaseUrl && getSecret('SUPABASE_SECRET_KEY') &&
    getSecret('RESEND_API_KEY') && getSecret('NEWSLETTER_FROM') && getSecret('CRON_SECRET'));
}

export function validSubscriptionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function subscriptionLink(site: URL, action: 'confirm' | 'unsubscribe', token: string) {
  const url = new URL('/subscription/', site);
  url.searchParams.set('action', action);
  url.searchParams.set('token', token);
  return url.href;
}

export async function sendEmail(to: string, subject: string, message: string, key: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + getSecret('RESEND_API_KEY'),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({ from: getSecret('NEWSLETTER_FROM'), to: [to], subject, text: message }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Email provider returned HTTP ' + response.status);
}

type Delivery = { id: string; email: string; unsubscribe: string; title: string; slug: string };

export async function deliverArticleEmails(site: URL, client: NonNullable<ReturnType<typeof subscriptionClient>>) {
  const deadline = Date.now() + 40_000;
  let sent = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const claim = await client.rpc('rb_claim_article_email').maybeSingle<Delivery>();
    if (claim.error) throw claim.error;
    const delivery = claim.data;
    if (!delivery) break;

    const articleUrl = new URL('/writing/' + encodeURIComponent(delivery.slug) + '/', site);
    articleUrl.searchParams.set('utm_medium', 'newsletter');
    articleUrl.searchParams.set('utm_campaign', 'afterthoughts');
    const unsubscribeUrl = subscriptionLink(site, 'unsubscribe', delivery.unsubscribe);
    try {
      await sendEmail(
        delivery.email,
        delivery.title.replace(/[\r\n]/g, ' '),
        [
          'New in The Afterthoughts',
          delivery.title,
          'Read the article: ' + articleUrl.href,
          'Unsubscribe: ' + unsubscribeUrl,
        ].join('\n\n'),
        'article/' + delivery.id,
      );
      const result = await client.from('rb_article_emails').update({ sent_at: new Date().toISOString() }).eq('id', delivery.id);
      if (result.error) throw result.error;
      sent++;
    } catch (error) {
      console.error('Newsletter delivery failed', delivery.id, error instanceof Error ? error.message : 'Could not persist delivery status');
      failed++;
    }
    await delay(550);
  }
  return { sent, failed };
}
