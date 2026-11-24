import { browserOptOut, linkDestination, measurementHost } from '../lib/readership';

function measure() {
  if (browserOptOut(navigator)) return;
  const article = document.querySelector<HTMLElement>('[data-read-post]');
  const body = article?.querySelector<HTMLElement>('.article-content');
  const path = location.pathname.replace(/\/$/, '');
  const page = article ? 'article' : path === '/writing' ? 'archive' : path === '' ? 'home' : null;
  if (!page) return;
  let visitor: string = crypto.randomUUID();
  try {
    const previous = localStorage.getItem('rb-reader');
    if (previous && /^[a-f0-9-]{36}$/i.test(previous)) visitor = previous;
    else localStorage.setItem('rb-reader', visitor);
  } catch {}
  const id = crypto.randomUUID();
  const post = article?.dataset.readPost ?? null;
  const source = document.referrer ? measurementHost(new URL(document.referrer).hostname) ?? 'Unknown' : 'Direct';
  const query = new URLSearchParams(location.search);
  const campaign = query.get('utm_campaign');
  const medium = query.get('utm_medium');
  let elapsed = 0, depth = 0, previous = performance.now(), lastInput = previous;
  let focused = !document.hidden && document.hasFocus();
  let lastSent = '';
  function tick() {
    const now = performance.now();
    if (focused) elapsed += Math.max(0, Math.min(now, lastInput + 60000) - previous);
    previous = now;
    focused = !document.hidden && document.hasFocus();
    if (body && focused) {
      const rect = body.getBoundingClientRect();
      if (rect.height > 0) depth = Math.max(depth, Math.min(100, Math.round(100 * (innerHeight - rect.top) / rect.height)));
    }
  }
  function send(destination: string | null = null, link: number | null = null, signup = false) {
    if (browserOptOut(navigator)) return;
    tick();
    const seconds = Math.min(14400, Math.floor(elapsed / 1000));
    const active = focused && previous - lastInput < 60000;
    const state = seconds + '/' + depth + '/' + active;
    if (!destination && !signup && state === lastSent && !(active && seconds === 14400)) return;
    const payload = JSON.stringify({ id, visitor, page, post, seconds, depth, source, active, signup, link,
      campaign:campaign && /^[a-z][a-z0-9_-]{0,47}$/i.test(campaign) ? campaign : null,
      medium:medium && /^[a-z_]{1,20}$/i.test(medium) ? medium : null,
      click:destination ? crypto.randomUUID() : null, destination });
    if (navigator.sendBeacon('/api/readership', new Blob([payload], {type:'application/json'}))) lastSent = state;
  }
  for (const event of ['scroll','pointerdown','keydown']) window.addEventListener(event, () => { tick(); lastInput = performance.now(); }, {passive:true});
  window.addEventListener('focus', () => { tick(); lastInput = performance.now(); send(); });
  window.addEventListener('blur', () => send());
  document.addEventListener('visibilitychange', () => send());
  window.addEventListener('pagehide', () => send());
  function recordClick(event: Event) {
    const anchor = event.target instanceof Element && event.target.closest('a');
    if (!(anchor instanceof HTMLAnchorElement) || !body) return;
    const destination = linkDestination(anchor.href);
    if (destination) send(destination, Array.from(body.querySelectorAll('a')).indexOf(anchor) + 1);
  }
  body?.addEventListener('click', recordClick);
  body?.addEventListener('auxclick', event => { if (event.button === 1) recordClick(event); });
  const form = article?.querySelector<HTMLFormElement>('.email-subscription form');
  form?.querySelector('button[type=submit]')?.addEventListener('click', () => send(null,null,true));
  form?.addEventListener('formdata', (event: FormDataEvent) => {
    if (browserOptOut(navigator)) return;
    event.formData.set('visit', id);
    event.formData.set('visitor', visitor);
  });
  send();
  window.setInterval(() => { if (!document.hidden) send(); }, 15000);
}
measure();
