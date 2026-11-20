import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const images=Array.from({length:20},(_,i)=>({path:`${owner}/${String(i).padStart(8,'0')}-4444-4444-8444-444444444444.webp`,alt:'Image'}));
const article={version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Body'}]}]},summary:'Summary',tags:['Writing'],cover:images[0].path};
interface Row { revision:number; article:unknown; slug:string; published_at:Date; body:string }

test('article saves enforce ownership, metadata limits, revisions and immutable public snapshots',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create policy legacy_access on storage.objects for all to anon,authenticated using(true) with check(true);
      grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611200001_private_editor.sql',import.meta.url),'utf8'));
    await db.query('insert into public.rb_drafts(id,title,body) values($1,$2,$3)',[id,'Existing draft','Keep literal <b>text</b>']);
    const upgrade=await readFile(new URL('../supabase/migrations/202611200002_article_editor.sql',import.meta.url),'utf8');
    await db.exec(upgrade);
    const legacy=(await db.query<Row>('select * from public.rb_drafts')).rows[0];
    assert.equal(legacy.body,'Keep literal <b>text</b>');assert.equal(legacy.article,null);assert.equal(legacy.revision,1);
    await db.query('delete from public.rb_drafts where id=$1',[id]);
    await db.query('insert into public.rb_studio_owners values($1)',[owner]);
    const role=async(who:string|null)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who??'']);await db.exec(`set role ${who?'authenticated':'anon'}`);};
    const save=(value:unknown=article,revision=0,body='Body',files:unknown=images)=>db.query<Row>('select * from public.rb_save_article($1,$2,$3,$4,$5,$6)',[id,'Title',body,JSON.stringify(files),JSON.stringify(value),revision]);
    await role(owner);
    assert.equal((await save()).rows[0].revision,1);
    for(const who of [null,other]){
      await role(who);await assert.rejects(save(article,1),/permission|owner/i);
      assert.equal((await db.query('select * from public.rb_drafts')).rows.length,0);
    }
    await role(owner);
    await assert.rejects(save(article,0),/conflict/i);
    await assert.rejects(db.query("update public.rb_drafts set article='{}'"),/permission/i);
    for(const invalid of [null,{}, {...article,version:2},{...article,doc:[]},{...article,summary:'x'.repeat(321)}, {...article,summary:null}, {...article,tags:Array(9).fill('tag')},{...article,tags:['x'.repeat(41)]},{...article,tags:[42]}, {...article,cover:'private/unknown.webp'}, {...article,doc:{type:'doc',padding:'x'.repeat(1048576)}}]){
      await assert.rejects(save(invalid,1),/invalid|limit/i);
    }
    await assert.rejects(save(article,1,'x'.repeat(100001)),/limit/i);
    await assert.rejects(save(article,1,'Body',[...images,{path:`${owner}/12345678-4444-4444-8444-444444444444.webp`,alt:''}]),/limit/i);
    await assert.rejects(save(article,1,'Body',[{path:`${other}/12345678-4444-4444-8444-444444444444.webp`,alt:''}]),/invalid/i);
    const first=(await db.query<Row>('select * from public.rb_publish_draft($1,1)',[id])).rows[0];
    assert.deepEqual(first.article,article);
    const updated={...article,summary:'Private change',cover:null};
    await save(updated,1,'x'.repeat(100000));
    await role(null);
    const snapshot=(await db.query<Row>('select * from public.rb_posts')).rows[0];
    assert.deepEqual(snapshot.article,article);assert.equal(snapshot.body,'Body');
    await role(owner);
    const second=(await db.query<Row>('select * from public.rb_publish_draft($1,2)',[id])).rows[0];
    assert.equal(second.slug,first.slug);assert.deepEqual(second.published_at,first.published_at);assert.deepEqual(second.article,updated);
    await db.query('select * from public.rb_save_draft($1,$2,$3,$4,$5)',[id,'Legacy title','x'.repeat(100000),JSON.stringify(images),2]);
    assert.equal((await db.query<Row>('select * from public.rb_drafts')).rows[0].article,null);
    assert.deepEqual((await db.query<Row>('select * from public.rb_posts')).rows[0].article,updated);
    await db.query('select public.rb_publish_draft($1,3)',[id]);
    assert.equal((await db.query<Row>('select * from public.rb_posts')).rows[0].article,null);
    await db.query("insert into storage.objects(bucket_id,name) values('rb-studio-images',$1)",[images[0].path]);
    await db.query('select public.rb_unpublish_post($1)',[id]);
    await role(null);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    const functionSecurity=await db.query<{prosecdef:boolean;proconfig:string[]}>("select prosecdef,proconfig from pg_proc where proname='rb_save_article'");
    assert.deepEqual(functionSecurity.rows,[{prosecdef:true,proconfig:['search_path=""']}]);
  }finally{await db.close();}
});
