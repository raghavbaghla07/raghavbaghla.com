import type { SupabaseClient } from '@supabase/supabase-js';
import { changeLabel, dayMillis, displayMetric, formatDate, isoDay, metrics, ratio, secondsLabel, type DateRange, type Report } from '../lib/analytics-report';
import { action, bars, element, note, tableBlock, trendChart } from './analytics-charts';
import { articleTable } from './analytics-content';

const byId=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export function setupAnalytics(client:SupabaseClient|null,openModeration:(id:string)=>Promise<void>) {
  const panel=byId('analytics-panel'), workspace=byId('workspace'), results=byId('analytics-results');
  const status=byId('analytics-status'), section=byId('analytics-section');
  const period=byId<HTMLSelectElement>('analytics-period'), form=byId<HTMLFormElement>('analytics-range');
  const from=byId<HTMLInputElement>('analytics-from'), through=byId<HTMLInputElement>('analytics-to');
  const tabs=Array.from(panel.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  let selected='Overview', bucket='day', version=0, liveVersion=0, timer=0;
  let report:Report|null=null, disposeContent:(()=>void)|undefined, live:HTMLElement|null=null;
  function preset(days:number):DateRange {
    const now=Date.now();
    return {start:isoDay(now-(days-1)*dayMillis),end:isoDay(now)};
  }
  let range=preset(30);
  function stopLive() {
    window.clearInterval(timer); liveVersion++; live=null;
  }
  async function refreshLive() {
    if (!live || document.hidden || panel.hidden || workspace.hidden) return;
    const generation=++liveVersion;
    try {
      const response=await client?.rpc('rb_live_browsers');
      if (!response || response.error) throw new Error();
      if (generation===liveVersion && live) live.textContent=String(response.data);
    } catch { if (generation===liveVersion && live) live.textContent='Unavailable'; }
  }
  function render() {
    disposeContent?.(); disposeContent=undefined; stopLive(); results.replaceChildren();
    if (!report || !client) return;
    const r=report;
    const coverage=()=>note('Audience labels, campaigns and subscription attribution are available from '+formatDate(r.since)+'.');
    if (selected==='Overview') {
      const cards=element('div',undefined,'analytics-metrics');
      for (const [key,label] of metrics) {
        const card=element('div',undefined,'analytics-metric');
        card.dataset.metric=key;
        card.append(element('span',label),element('strong',displayMetric(key,r.metrics.current[key])),
          element('small',changeLabel(r.metrics.current[key],r.metrics.previous[key])));
        cards.append(card);
      }
      const presence=element('div',undefined,'analytics-live'); live=element('strong','…');
      presence.append(live,' active browsers in the last 5 minutes');
      const traffic=trendChart('Readership over time',r.trend,['views','uniques'],['Page views','Unique browsers']);
      const grouping=element('label','Group by'), select=element('select');
      for (const [value,label] of [['day','Day'],['week','Week'],['month','Month']]) select.add(new Option(label,value));
      select.value=bucket; grouping.append(select);
      select.addEventListener('change',()=>{ bucket=select.value; void load(true); });
      traffic.querySelector('.analytics-section-head')!.append(grouping);
      select.id='analytics-bucket';
      const engagement=trendChart('Engagement over time',r.trend,['likes','comments'],['Likes received','Comments submitted']);
      if (r.pending.count && r.pending.post) {
        const target=r.pending.post;
        const review=action(r.pending.count+' pending · Review comments',()=>void openModeration(target));
        engagement.querySelector('.analytics-section-head')!.append(review);
      }
      results.append(presence,cards,traffic,engagement,note('Uniques count browsers. Good reads reach 90% of an article with at least 30 seconds of active time.'));
      void refreshLive(); timer=window.setInterval(()=>void refreshLive(),45000);
    } else if (selected==='Content') {
      const articles=articleTable(client,range); disposeContent=articles.dispose;
      const time=element('div'), group=element('div',undefined,'analytics-controls');
      const label=element('label','Rank pages by'), select=element('select');
      select.add(new Option('Total active time','total')); select.add(new Option('Average active time','average'));
      label.append(select); group.append(label);
      function rank() {
        const average=select.value==='average';
        const rows=(average ? r.time_average : r.time_total).map(p=>{
          const value=average?p.average:p.total; return {label:p.label,value,display:secondsLabel(value)};
        });
        time.replaceChildren(bars('Where readers spend time',rows,'Active seconds'));
        time.querySelector('.analytics-section-head')!.after(group);
      }
      select.addEventListener('change',()=>{ rank(); select.focus(); }); rank();
      const depth=bars('Scroll drop-off',r.depth.map(d=>({label:'Reached '+d.level+'%',value:d.reached,
        display:ratio(d.reached,r.funnel.views)+' · '+d.reached.toLocaleString()+' views'})),'Article views',r.funnel.views);
      depth.append(note('Share of article views that reached each point in the article body.'));
      results.append(articles.root,time,depth);
    } else if (selected==='Audience') {
      const pair=element('div',undefined,'analytics-pair');
      const countries=new Intl.DisplayNames(undefined,{type:'region'});
      const regions=(r.breakdowns.countries ?? []).map(row=>({...row,label:/^[A-Z]{2}$/.test(row.label)? countries.of(row.label) ?? row.label : row.label}));
      pair.append(bars('Devices',r.breakdowns.devices ?? [],'Views'),bars('Browsers',r.breakdowns.browsers ?? [],'Views'));
      const audience=bars('New and returning browsers',[{label:'New',value:r.audience.new},{label:'Returning',value:r.audience.returning}],'Browsers');
      audience.append(note('Returning browsers were first seen before this reporting period.'));
      results.append(audience,pair,bars('Countries',regions,'Views'),coverage());
    } else if (selected==='Sources') {
      const values=(rows:{label:string;value:number}[]=[])=>rows.map(item=>[item.label,item.value]);
      const headings=['Article','Destination host','Link in article','Clicks'];
      const linkRows=(links:Report['links'])=>links.map(l=>[l.article,l.destination,l.link_number ?? '—',l.clicks]);
      const details=element('details');
      const allLinks=element('div');
      details.append(element('summary','All article links, including internal links'),allLinks);
      let loaded=false, loading=false;
      details.addEventListener('toggle',async ()=>{
        if (!details.open || loaded || loading || !client) return;
        loading=true; allLinks.replaceChildren(note('Loading links…'));
        try {
          const {data,error}=await client.rpc('rb_analytics_article_links',{p_start:range.start,p_end:range.end});
          if (error) throw error;
          if (details.isConnected) allLinks.replaceChildren(tableBlock('All article links',headings,linkRows(data)));
          loaded=true;
        } catch { allLinks.replaceChildren(note('Could not load links. Close and reopen to retry.')); }
        finally { loading=false; }
      });
      results.append(bars('Traffic channels',r.breakdowns.channels ?? [],'Views'),
        tableBlock('Top referring hosts',['Source','Views'],values(r.breakdowns.hosts)),
        tableBlock('UTM campaigns',['Campaign','Views'],values(r.breakdowns.campaigns)),
        tableBlock('Top outbound links',headings,linkRows(r.links)),details,coverage());
    } else {
      const f=r.funnel, mail=r.newsletter;
      const funnel=tableBlock('Article subscription funnel',['Stage','Article visits','From previous step','From article view'],[
        ['Article view',f.eligible,'—',ratio(f.eligible,f.eligible)],
        ['Subscribe click',f.signups,ratio(f.signups,f.eligible),ratio(f.signups,f.eligible)],
        ['Confirmed subscriber',f.confirmed,ratio(f.confirmed,f.signups),ratio(f.confirmed,f.eligible)],
      ]);
      funnel.append(note('Each measured article visit counts once per stage. A confirmation stays with the original visit, even if it happens later.'));
      const delivery=tableBlock('Email delivery',['Measure','Count'],[
        ['Provider-accepted sends in period',mail.accepted],['Queued or retrying now',mail.queued],
        ['Attempt limit reached · unsent now',mail.exhausted],['Confirmed subscribers now',mail.total],
      ]);
      delivery.append(note('Accepted sends count messages the email provider accepted. Inbox delivery receipts are unavailable.'));
      results.append(funnel,delivery,coverage());
    }
  }
  function updateDates() {
    const start=Date.parse(range.start), span=Date.parse(range.end)-start+dayMillis;
    byId('analytics-dates').textContent=formatDate(range.start)+' – '+formatDate(range.end)+' · UTC';
    status.textContent='Compared with '+formatDate(isoDay(start-span))+' – '+formatDate(isoDay(start-dayMillis))+'.';
  }
  async function load(restoreBucketFocus=false) {
    const generation=++version;
    disposeContent?.(); disposeContent=undefined; stopLive(); report=null;
    updateDates(); status.textContent='Loading analytics…'; section.setAttribute('aria-busy','true');
    results.replaceChildren(...[1,2].map(()=>element('div',undefined,'analytics-skeleton')));
    try {
      const response=await client?.rpc('rb_analytics_report',{p_start:range.start,p_end:range.end,p_bucket:bucket});
      if (generation!==version) return;
      if (!response || response.error) throw new Error();
      report=response.data as Report; updateDates(); render();
      if (restoreBucketFocus) document.getElementById('analytics-bucket')?.focus();
    } catch {
      if (generation!==version) return;
      results.replaceChildren(); status.textContent='Could not load analytics. Use Refresh to try again.';
    } finally { if (generation===version) section.setAttribute('aria-busy','false'); }
  }
  function selectTab(tab:HTMLButtonElement) {
    selected=tab.dataset.section!;
    for (const button of tabs) { button.tabIndex=button===tab?0:-1; button.setAttribute('aria-selected',String(button===tab)); }
    section.setAttribute('aria-labelledby',tab.id);
    if (report) render();
  }
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      const index=event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:
        event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
      if (index>=0) { event.preventDefault(); tabs[index].focus(); selectTab(tabs[index]); }
    });
  });
  function show(open:boolean) {
    version++; stopLive(); disposeContent?.(); disposeContent=undefined; report=null;
    panel.hidden=!open; byId('editor-pane').hidden=open; workspace.dataset.view=open?'analytics':'editor';
    byId('writing-view').setAttribute('aria-pressed',String(!open)); byId('analytics-view').setAttribute('aria-pressed',String(open));
    if (open) {
      if (period.value!=='custom') range=preset(Number(period.value));
      void load();
    } else { results.replaceChildren(); status.textContent=''; }
  }
  byId('analytics-view').addEventListener('click',()=>show(true));
  for (const id of ['writing-view','draft-list','new-draft']) byId(id).addEventListener('click',()=>show(false));
  byId('analytics-refresh').addEventListener('click',()=>void load());
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden) void refreshLive(); });
  period.addEventListener('change',()=>{
    form.hidden=period.value!=='custom';
    if (!form.hidden) {
      from.value=range.start; through.value=range.end; from.max=through.max=isoDay(Date.now());
      through.setCustomValidity(''); from.focus(); return;
    }
    range=preset(Number(period.value)); void load();
  });
  form.addEventListener('input',()=>through.setCustomValidity(''));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const days=(Date.parse(through.value)-Date.parse(from.value))/dayMillis+1;
    if (!(days>=1 && days<=365)) { through.setCustomValidity('Choose a range of 1 to 365 days.'); through.reportValidity(); return; }
    range={start:from.value,end:through.value}; void load();
  });
  return ()=>show(false);
}
