import type { createStudioClient } from '../lib/supabase';

type Report = {
  visitors:number; views:number; email_subscribers?:number;
  traffic:{day:string;views:number;visitors:number}[];
  articles:{title:string;views:number;readers:number;seconds:number;reads:number}[];
  links:{title:string;destination:string;clicks:number}[];
  sources:{source:string;views:number}[];
};

export function setupAnalytics(client: ReturnType<typeof createStudioClient>) {
  const byId = (id:string) => document.getElementById(id)!;
  const panel = byId('analytics-panel'), editor = byId('editor-pane'), results = byId('analytics-results');
  const status = byId('analytics-status'), period = byId('analytics-period') as HTMLSelectElement;
  const writing = byId('writing-view'), analytics = byId('analytics-view');
  let request = 0;
  async function load() {
    const version = ++request;
    results.replaceChildren();
    status.textContent = 'Loading readership…';
    const response = await client?.rpc('rb_readership', {p_days:Number(period.value)});
    if (request !== version) return;
    if (!response || response.error) { status.textContent = 'Could not load readership. Check the connection and refresh.'; return; }
    const report = response.data as Report;
    status.textContent = 'Visitors are distinct browsers. A good read reaches 90% of the article with at least 30 seconds of active reading.';
    const metrics = document.createElement('div');
    metrics.className = 'metric-grid';
    const counts: [string, number][] = [['Page views', report.views], ['Unique browsers', report.visitors]];
    if (typeof report.email_subscribers === 'number') counts.push(['Email subscribers', report.email_subscribers]);
    for (const [label,value] of counts) {
      const card = document.createElement('div'), number = document.createElement('strong');
      number.textContent = value.toLocaleString(); card.append(number,label); metrics.append(card);
    }
    results.append(metrics);
    function table(title:string, labels:string[], rows:(string|number)[][]) {
      const heading = document.createElement('h3'); heading.textContent = title; results.append(heading);
      if (!rows.length) { const empty = document.createElement('p'); empty.textContent = 'No activity in this period.'; results.append(empty); return; }
      const wrap = document.createElement('div'), grid = document.createElement('table');
      wrap.className = 'report-table';
      grid.setAttribute('aria-label',title);
      const head = grid.createTHead().insertRow();
      for (const label of labels) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); }
      const body = grid.createTBody();
      for (const values of rows) { const tr = body.insertRow(); for (const value of values) tr.insertCell().textContent = String(value); }
      wrap.append(grid); results.append(wrap);
    }
    const daily = document.createElement('details');
    const caption = document.createElement('summary');
    caption.textContent = 'Daily traffic (UTC)';
    daily.append(caption);
    const peak = Math.max(1,...report.traffic.map(day => day.views));
    for (const day of [...report.traffic].reverse()) {
      const row = document.createElement('div'), meter = document.createElement('meter');
      row.className = 'traffic-day';
      meter.min = 0; meter.max = peak; meter.value = day.views;
      meter.setAttribute('aria-label',day.views + ' page views');
      row.append(day.day,meter,day.views + ' views · ' + day.visitors + ' visitors');
      daily.append(row);
    }
    results.append(daily);
    table('Article performance',['Article','Views','Readers','Avg. active time','Good reads','Read rate'],report.articles.map(a=>[a.title,a.views,a.readers,`${Math.floor(a.seconds/60)}m ${a.seconds%60}s`,a.reads,`${Math.round(100*a.reads/a.views)}%`]));
    table('Most-clicked article links',['Article','Destination','Clicks'],report.links.map(l=>[l.title,l.destination,l.clicks]));
    table('Traffic sources',['Referring site','Views'],report.sources.map(s=>[s.source,s.views]));
  }
  function show(open:boolean) {
    request++; panel.hidden = !open; editor.hidden = open;
    writing.setAttribute('aria-pressed',String(!open)); analytics.setAttribute('aria-pressed',String(open));
    if (open) void load(); else results.replaceChildren();
  }
  analytics.addEventListener('click',()=>show(true));
  writing.addEventListener('click',()=>show(false));
  byId('draft-list').addEventListener('click',()=>show(false));
  byId('new-draft').addEventListener('click',()=>show(false));
  byId('analytics-refresh').addEventListener('click',()=>void load());
  period.addEventListener('change',()=>void load());
  return () => show(false);
}
