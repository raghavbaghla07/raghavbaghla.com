export function optedOut(headers: Headers) {
  return headers.get('sec-gpc') === '1' || headers.get('dnt') === '1';
}

export function browserOptOut(browser: Pick<Navigator, 'doNotTrack'> & { globalPrivacyControl?: boolean }) {
  return browser.doNotTrack === '1' || browser.globalPrivacyControl === true;
}

export function audienceLabels(headers: Headers) {
  const agent = headers.get('user-agent') ?? '';
  const country = headers.get('x-vercel-ip-country')?.toUpperCase();
  const device = !agent ? null : /ipad|tablet|android(?!.*mobile)/i.test(agent) ? 'Tablet'
    : /mobi|iphone|ipod/i.test(agent) ? 'Mobile' : 'Desktop';
  const families = [
    [/edg(?:e|a|ios)?\//i, 'Edge'], [/samsungbrowser\//i, 'Samsung Internet'],
    [/(?:firefox|fxios)\//i, 'Firefox'], [/(?:chrome|crios)\//i, 'Chrome'], [/safari\//i, 'Safari'],
  ] as const;
  return { country: country && /^[A-Z]{2}$/.test(country) ? country : null, device,
    browser: agent ? families.find(([pattern]) => pattern.test(agent))?.[1] ?? 'Other' : null };
}

export function campaignLabels(campaign: unknown, medium: unknown, configured = '') {
  const allowed = ['afterthoughts', ...configured.toLowerCase().split(',').map(s => s.trim())];
  const name = typeof campaign === 'string' ? campaign.toLowerCase() : '';
  const channels: Record<string, string> = { email:'newsletter', newsletter:'newsletter', cpc:'search',
    ppc:'search', search:'search', organic:'search', social:'social', social_paid:'social', referral:'other' };
  const key = typeof medium === 'string' ? medium.toLowerCase() : '';
  return { campaign: /^[a-z][a-z0-9_-]{0,47}$/.test(name) && allowed.includes(name) ? name : null,
    medium: Object.hasOwn(channels,key) ? channels[key] : null };
}

// Never transmit link paths, query strings, credentials, email addresses or IP literals.
export function measurementHost(value: unknown) {
  return typeof value === 'string' && value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value) ? value.toLowerCase() : null;
}

export function linkDestination(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'mailto:') return 'mailto:';
    const host = measurementHost(url.hostname);
    return host && ['https:', 'http:'].includes(url.protocol) ? 'https://' + host : null;
  } catch { return null; }
}

