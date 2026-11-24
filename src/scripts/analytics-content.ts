import type { SupabaseClient } from '@supabase/supabase-js';
import { columns, displayMetric, type ArticlePage, type ArticleRow, type Column, type DateRange } from '../lib/analytics-report';
import { action, block, dataTable, download, element, note } from './analytics-charts';

function cells(row:ArticleRow) {
  return columns.map(([key])=>key==='title' ? row.title : displayMetric(key,row[key]));
}
export function articleTable(client:SupabaseClient,range:DateRange) {
  const {root,header}=block('Article performance');
  const controls=element('div',undefined,'analytics-controls');
  const label=element('label','Search articles'), search=element('input');
  search.type='search'; search.maxLength=160; search.placeholder='Article title'; label.append(search);
  const status=note(''); status.setAttribute('role','status');
  const results=element('div'), pager=element('div',undefined,'analytics-pager');
  let query='', sort:Column='views', desc=true, offset=0, version=0, timer=0, disposed=false;
  const fetchPage=async (skip:number) => {
    const {data,error}=await client.rpc('rb_analytics_content',{p_start:range.start,p_end:range.end,p_search:query,p_sort:sort,p_desc:desc,p_offset:skip});
    if (error) throw error;
    return data as ArticlePage;
  };
  const headings=columns.map(([,name])=>name);
  const exportButton=action('Export CSV',()=>void exportAll());
  async function exportAll() {
    const generation=version;
    exportButton.disabled=true;
    try {
      const rows:ArticleRow[]=[];
      let page:ArticlePage;
      do {
        page=await fetchPage(rows.length);
        if (disposed || generation!==version) return;
        rows.push(...page.rows);
      } while (page.rows.length && rows.length<page.total);
      download('Articles '+range.start+' to '+range.end,headings,rows.map(cells));
    } catch { if (!disposed && generation===version) status.textContent='Export failed. Try again.'; }
    finally { if (!disposed && generation===version) exportButton.disabled=false; }
  }
  const previous=action('Previous',()=>{ offset-=50; void load(); });
  const next=action('Next',()=>{ offset+=50; void load(); });
  async function load(focusColumn?:Column) {
    const generation=++version;
    status.textContent='Loading articles…';
    previous.disabled=next.disabled=exportButton.disabled=true;
    results.replaceChildren(); pager.hidden=true;
    try {
      const page=await fetchPage(offset);
      if (disposed || generation!==version) return;
      status.textContent=page.total ? (offset+1)+'–'+(offset+page.rows.length)+' of '+page.total+' articles'
        : query ? 'No articles match this search.' : 'No published articles or activity in this period.';
      if (!page.rows.length) return;
      const table=dataTable('Article performance',headings,page.rows.map(cells));
      for (const [i,[key,name]] of columns.entries()) {
        const th=table.head.cells[i];
        if (key===sort) th.setAttribute('aria-sort',desc?'descending':'ascending');
        const button=action(name+(key===sort?(desc?' ↓':' ↑'):''),()=>{
          desc=key===sort ? !desc : key!=='title'; sort=key; offset=0; void load(key);
        });
        button.dataset.column=key;
        th.replaceChildren(button);
      }
      results.append(table.wrap);
      pager.hidden=page.total<=50;
      previous.disabled=offset===0; next.disabled=offset+page.rows.length>=page.total;
      if (focusColumn) results.querySelector<HTMLButtonElement>('[data-column="'+focusColumn+'"]')?.focus();
    } catch { if (!disposed && generation===version) {
      status.textContent='Could not load articles.'; results.append(action('Retry',()=>void load()));
    } } finally { if (!disposed && generation===version) exportButton.disabled=false; }
  }
  search.addEventListener('input',()=>{
    window.clearTimeout(timer); version++; query=search.value.trim(); offset=0; exportButton.disabled=true;
    timer=window.setTimeout(()=>void load(),180);
  });
  controls.append(label); header.append(exportButton); pager.append(previous,next);
  root.append(controls,status,results,pager);
  void load();
  return {root,dispose:()=>{ disposed=true; window.clearTimeout(timer); }};
}
