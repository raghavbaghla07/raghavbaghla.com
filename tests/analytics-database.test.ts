import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initializeFixture } from './fixtures/analytics-db.ts';

test('dashboard reports enforce ownership, count distinct browsers, and retain confirmed events', async () => {
  const db = new PGlite();
  const file = (path:string) => readFile(new URL(path,import.meta.url),'utf8');
  try {
    await initializeFixture(db);
    await db.exec(await file('../supabase/tests/analytics-access.sql'));
    await db.exec(await file('./fixtures/seed-analytics.sql'));
    const owner = crypto.randomUUID();
    await db.query('insert into public.rb_studio_owners values ($1)',[owner]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.exec("set timezone='UTC'; set role authenticated");
    const {rows:[{r}]} = await db.query<{r: {metrics:{current:{views:number;uniques:number;subscribers:number}},trend:{views:number;uniques:number}[],
      depth:{reached:number}[], audience:{new:number;returning:number},funnel:{eligible:number;signups:number;confirmed:number},
      newsletter:{total:number}, breakdowns:{channels:{label:string;value:number}[]}}}>(
      "select public.rb_analytics_report(current_date-29,current_date,'month') r");
    assert.equal(r.trend.reduce((sum,t)=>sum+t.views,0),r.metrics.current.views);
    assert.equal(r.audience.new+r.audience.returning,r.metrics.current.uniques);
    assert.ok(r.metrics.current.uniques < r.metrics.current.views);
    assert.ok(r.depth.every((row,i) => i===0 || row.reached<=r.depth[i-1].reached));
    assert.ok(r.funnel.eligible>=r.funnel.signups && r.funnel.signups>=r.funnel.confirmed && r.funnel.confirmed>0);
    assert.ok(r.breakdowns.channels.some(c=>c.label==='Newsletter'));
    const {rows:[{content}]}=await db.query<{content:{total:number;rows:{title:string;views:number}[]}}>(
      "select public.rb_analytics_content(current_date-29,current_date,'notebook','views',true,0) content");
    assert.equal(content.total,1);
    assert.match(content.rows[0].title,/notebook/);
    await assert.rejects(db.exec("select public.rb_analytics_report(current_date-365,current_date,'day')"),/365/);
    await assert.rejects(db.exec("select public.rb_analytics_report(current_date,current_date,'year')"),/interval/);
    await assert.rejects(db.exec("select public.rb_analytics_content(current_date,current_date,'','title',true,-1)"),/filters/);
    await db.exec('reset role');
    const scalar = async <T>(query:string,args:unknown[]=[]) => (await db.query<{v:T}>(query,args)).rows[0].v;
    const visitor=crypto.randomUUID(), visit=crypto.randomUUID(), click=crypto.randomUUID();
    const post=await scalar<string>('select id v from public.rb_posts limit 1');
    await db.exec('set role service_role');
    const measure = (seconds:number,depth:number) => db.query(
      "select public.rb_measure($1,$2,'article',$3,$4,$5,'google.com',$6,'https://example.org/path?token=private',2,'IN','Mobile','Safari',null,null,true,true)",
      [visit,visitor,post,seconds,depth,click]);
    await measure(45,95); await measure(10,25);
    const token=await scalar<string>("select public.rb_request_attributed_email('new@example.invalid','fixture',$1,$2) v",[visit,visitor]);
    assert.equal(await scalar('select public.rb_confirm_private_email($1,false) v',[token]),true);
    assert.equal(await scalar('select public.rb_confirm_private_email($1,false) v',[token]),true);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select seconds,depth,converted from public.rb_visits where id=$1',[visit])).rows,
      [{seconds:45,depth:95,converted:true}]);
    assert.equal(await scalar('select destination v from public.rb_link_clicks where id=$1',[click]),'https://example.org');
    await db.exec("delete from public.rb_email_subscriptions where email='new@example.invalid'");
    assert.equal(Number(await scalar("select public.rb_analytics_report(current_date-29,current_date,'day')#>>'{metrics,current,subscribers}' v")),r.metrics.current.subscribers+1);
    assert.equal(Number(await scalar("select public.rb_live_browsers() v"))>0,true);
    assert.equal(await scalar("select public.rb_analytics_report(date '2000-01-05',date '2000-01-05','day')#>'{metrics,current,rate}' v"),null);
  } finally { await db.close(); }
});
