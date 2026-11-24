export const metrics = [
  ['views','Page views'],['uniques','Unique browsers'],['average','Avg. active time'],['rate','Good-read rate'],
  ['subscribers','New followers'],['likes','Likes received'],['comments','Comments submitted'],
] as const;
export type Metric = typeof metrics[number][0];
export type Trend = { day:string; views:number; uniques:number; likes:number; comments:number };
export type Breakdown = {label:string;value:number};
export type Report = {
  metrics:Record<'current'|'previous',Record<Metric,number|null>>;
  trend:Trend[];
  breakdowns:Partial<Record<'channels'|'hosts'|'campaigns'|'devices'|'countries'|'browsers',Breakdown[]>>;
  time_total:{label:string;total:number;average:number}[];
  time_average:Report['time_total'];
  audience:{new:number;returning:number};
  depth:{level:number;reached:number}[];
  links:{article:string;destination:string;link_number:number|null;clicks:number}[];
  pending:{count:number;post:string|null};
  funnel:{views:number;eligible:number;signups:number;confirmed:number};
  newsletter:{total:number;accepted:number;queued:number;exhausted:number};
  since:string;
};
export const columns = [
  ['title','Article'],['views','Views'],['uniques','Uniques'],['average','Avg. active time'],
  ['d25','Reached 25%'],['d50','Reached 50%'],['d75','Reached 75%'],['d90','Reached 90%'],['d100','Reached 100%'],
  ['rate','Good-read rate'],['likes','Likes'],['comments','Comments'],['subscribers','Follows'],
] as const;
export type Column = typeof columns[number][0];
export type ArticleRow = {title:string;id:string} & Record<Exclude<Column,'title'>,number|null>;
export type ArticlePage = {total:number;rows:ArticleRow[]};
export type DateRange = {start:string;end:string};
export type Cell = string | number;

export const dayMillis = 86_400_000;
export function isoDay(time:number) { return new Date(time).toISOString().slice(0,10); }
export function formatDate(day:string) {
  return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
}
export function secondsLabel(seconds:number) {
  if (seconds < 60) return seconds+'s';
  if (seconds < 3600) return Math.floor(seconds/60)+'m '+seconds%60+'s';
  return Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m';
}
export function displayMetric(key:string,value:number|null) {
  if (value===null) return '—';
  if (key==='average') return secondsLabel(value);
  if (key==='rate' || /^d\d+$/.test(key)) return value.toLocaleString(undefined,{maximumFractionDigits:1})+'%';
  return value.toLocaleString();
}
export function changeLabel(value:number|null,previous:number|null) {
  if (value===null || previous===null) return 'No comparison';
  if (previous===0) return value===0 ? '0% change' : 'New this period';
  const change=(value-previous)/previous*100;
  return change.toLocaleString(undefined,{maximumFractionDigits:1,signDisplay:'exceptZero'})+'%';
}
export function ratio(n:number,d:number) {
  return d ? (n/d*100).toLocaleString(undefined,{maximumFractionDigits:1})+'%' : '—';
}
export function csvText(headings:readonly string[],rows:Cell[][]) {
  const quote=(cell:Cell) => {
    const value=String(cell);
    const safe=typeof cell==='string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(value) ? "'"+value : value;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+[headings,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
