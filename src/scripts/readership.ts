function measure() {
  if (navigator.doNotTrack === '1' || (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl) return;
  const article = document.querySelector<HTMLElement>('[data-read-post]');
  const body = article?.querySelector<HTMLElement>('.article-content');
  const path = location.pathname.replace(/\/$/, '');
  const page = article ? 'article' : path === '/writing' ? 'archive' : path === '' ? 'home' : null;
  if (!page) return;
  let visitor: string = crypto.randomUUID();
  try {
    const previous = localStorage.getItem('rb-reader');
    if (previous) visitor = previous;
    else localStorage.setItem('rb-reader', visitor);
  } catch {}
  const id = crypto.randomUUID();
  const source = document.referrer ? new URL(document.referrer).hostname : 'Direct';
  let elapsed = 0, depth = 0, previous = performance.now(), lastInput = previous;
  let active = !document.hidden && document.hasFocus();
  let lastSent = '';
  function tick() {
    const now = performance.now();
    if (active) elapsed += Math.max(0, Math.min(now, lastInput + 60000) - previous);
    previous = now;
    active = !document.hidden && document.hasFocus();
    if (body && active) {
      const rect = body.getBoundingClientRect();
      if (rect.height > 0) depth = Math.max(depth, Math.min(100, Math.round(100 * (innerHeight - rect.top) / rect.height)));
    }
  }
  function send(destination: string | null = null) {
    tick();
    const seconds = Math.min(14400, Math.floor(elapsed / 1000));
    const state = seconds + '/' + depth;
    if (!destination && state === lastSent) return;
    const payload = JSON.stringify({id, visitor, page, post:article?.dataset.readPost || null, seconds, depth, source,
      click:destination ? crypto.randomUUID() : null, destination});
    if (navigator.sendBeacon('/api/readership', new Blob([payload], {type:'application/json'}))) lastSent = state;
  }
  for (const event of ['scroll','pointerdown','keydown']) window.addEventListener(event, () => { tick(); lastInput = performance.now(); }, {passive:true});
  window.addEventListener('focus', () => { tick(); lastInput = performance.now(); });
  window.addEventListener('blur', () => send());
  document.addEventListener('visibilitychange', () => send());
  window.addEventListener('pagehide', () => send());
  function recordClick(event: Event) {
    const anchor = event.target instanceof Element && event.target.closest('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const url = new URL(anchor.href);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) send(anchor.href.slice(0,2048));
  }
  body?.addEventListener('click', recordClick);
  body?.addEventListener('auxclick', event => { if (event.button === 1) recordClick(event); });
  send();
  if (article) window.setInterval(() => { if (!document.hidden) send(); }, 15000);
}
measure();
