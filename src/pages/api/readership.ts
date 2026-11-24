import { getSecret } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { createPublicClient } from '../../lib/supabase';
import { subscriptionClient } from '../../lib/email-subscriptions';
import { audienceLabels, campaignLabels, linkDestination, measurementHost, optedOut } from '../../lib/readership';

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('origin') !== url.origin) return new Response(null, { status: 403 });
  if (optedOut(request.headers)) return new Response(null, { status: 204 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, { status: 415 });
  if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 });
  const server = subscriptionClient();
  const client = server ?? createPublicClient();
  if (!client) return new Response(null, { status: 503 });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const data = JSON.parse(raw);
    const destination = linkDestination(data.destination);
    const visit = { p_id:data.id, p_visitor:data.visitor, p_page:data.page, p_post:data.post,
      p_seconds:data.seconds, p_depth:data.depth, p_source:data.source === 'Direct' ? 'Direct' : measurementHost(data.source) ?? 'Unknown',
      p_click:destination ? data.click : null, p_destination:destination };
    const labels = audienceLabels(request.headers);
    const campaign = campaignLabels(data.campaign, data.medium, getSecret('ANALYTICS_CAMPAIGNS'));
    const response = server ? await server.rpc('rb_measure', { ...visit,
      p_link:data.link ?? null, p_country:labels.country, p_device:labels.device, p_browser:labels.browser,
      p_campaign:campaign.campaign, p_medium:campaign.medium, p_active:data.active === true, p_signup:data.signup === true,
    }) : await client.rpc('rb_visit', visit);
    return new Response(null, { status: response.error ? 400 : 204 });
  } catch { return new Response(null, { status: 400 }); }
};
