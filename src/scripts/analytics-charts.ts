import { csvText, type Cell, type Trend } from '../lib/analytics-report';

export function element<K extends keyof HTMLElementTagNameMap>(tag:K, text?:string, className?:string) {
  const node=document.createElement(tag);
  if (text!==undefined) node.textContent=text;
  if (className) node.className=className;
  return node;
}
export function action(text:string,onClick:()=>void) {
  const button=element('button',text);
  button.type='button';
  button.addEventListener('click',onClick);
  return button;
}
export function block(title:string) {
  const root=element('section',undefined,'analytics-block');
  const header=element('div',undefined,'analytics-section-head');
  header.append(element('h3',title)); root.append(header);
  return {root,header};
}
export function note(text:string) { return element('p',text,'analytics-note'); }
export function download(title:string,labels:readonly string[],rows:Cell[][]) {
  const url=URL.createObjectURL(new Blob([csvText(labels,rows)],{type:'text/csv;charset=utf-8'}));
  const link=element('a');
  link.href=url; link.download=title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.csv';
  link.click(); window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function dataTable(title:string,headings:string[],rows:Cell[][]) {
  const wrap=element('div',undefined,'analytics-scroll');
  wrap.tabIndex=0; wrap.setAttribute('role','region'); wrap.setAttribute('aria-label',title);
  const table=element('table');
  table.setAttribute('aria-label',title);
  const head=table.createTHead().insertRow();
  for (const label of headings) { const th=element('th',label); th.scope='col'; head.append(th); }
  const body=table.createTBody();
  for (const values of rows) { const row=body.insertRow(); for (const value of values) row.insertCell().textContent=String(value); }
  wrap.append(table);
  return {wrap,head};
}
export function tableBlock(title:string,headings:string[],rows:Cell[][]) {
  const {root,header}=block(title);
  header.append(action('Export CSV',()=>download(title,headings,rows)));
  root.append(rows.length ? dataTable(title,headings,rows).wrap : note('No activity in this period.'));
  return root;
}
export function bars(title:string,rows:{label:string;value:number;display?:string}[],unit:string,max?:number) {
  const {root,header}=block(title);
  header.append(action('Export CSV',()=>download(title,['Label',unit],rows.map(r=>[r.label,r.value]))));
  if (!rows.length || rows.every(r=>r.value===0) && !max) { root.append(note('No activity in this period.')); return root; }
  const scale=max ?? Math.max(1,...rows.map(r=>r.value));
  const list=element('ol',undefined,'analytics-bars');
  for (const row of rows) {
    const li=element('li'), track=element('span',undefined,'analytics-track'), ink=element('i');
    ink.style.width=Math.max(0,Math.min(100,100*row.value/scale))+'%';
    track.setAttribute('aria-hidden','true'); track.append(ink);
    li.append(element('span',row.label),element('span',row.display ?? row.value.toLocaleString()),track); list.append(li);
  }
  root.append(list); return root;
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string|number>) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for (const [name,value] of Object.entries(attributes)) node.setAttribute(name,String(value));
  return node;
}
export function trendChart(title:string,trend:Trend[],keys:[keyof Omit<Trend,'day'>,keyof Omit<Trend,'day'>],labels:[string,string]) {
  const {root,header}=block(title);
  const headings=['Bucket start (UTC)',...labels];
  const rows=trend.map(point=>[point.day,...keys.map(key=>point[key])]);
  header.append(action('Export CSV',()=>download(title,headings,rows)));
  if (!trend.some(point=>keys.some(key=>point[key]>0))) { root.append(note('No activity in this period.')); return root; }
  const svg=svgNode('svg',{viewBox:'0 0 640 200',class:'analytics-chart',role:'img','aria-label':title+' by reporting interval. Exact values follow the chart.'});
  const left=46,right=626,top=12,bottom=166;
  const peak=Math.max(2,...trend.flatMap(point=>keys.map(key=>point[key])));
  const ceiling=Math.ceil(peak/2)*2;
  const x=(i:number)=>trend.length===1 ? (left+right)/2 : left+(right-left)*i/(trend.length-1);
  const y=(v:number)=>bottom-(bottom-top)*v/ceiling;
  for (const level of [0,ceiling/2,ceiling]) {
    const label=svgNode('text',{x:left-7,y:y(level)+4,'text-anchor':'end'}); label.textContent=level.toLocaleString();
    svg.append(svgNode('line',{x1:left,x2:right,y1:y(level),y2:y(level),class:'guide'}),label);
  }
  for (const [i,key] of keys.entries()) {
    const points=trend.map((point,j)=>x(j)+','+y(point[key])).join(' ');
    svg.append(svgNode('polyline',{points,class:'series'+(i?' secondary-series':'')}));
    if (trend.length===1) svg.append(svgNode('circle',{cx:x(0),cy:y(trend[0][key]),r:i?3:5,fill:i?'#a7ac9f':'#f0eee5'}));
  }
  for (const i of new Set([0,trend.length-1])) {
    const label=svgNode('text',{x:x(i),y:192,'text-anchor':trend.length===1?'middle':i===0?'start':'end'});
    label.textContent=trend[i].day; svg.append(label);
  }
  const legend=element('div',undefined,'analytics-legend');
  for (const name of labels) legend.append(element('span',name));
  const details=element('details');
  details.append(element('summary','View chart data'),dataTable(title,headings,rows).wrap);
  root.append(legend,svg,details);
  return root;
}
