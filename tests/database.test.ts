import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

interface BucketRow { public: boolean; file_size_limit: number | string; allowed_mime_types: string[] }
interface FunctionRow { prosecdef: boolean; proconfig: string[] }
interface DraftRow { revision: number }
interface PostRow { body: string; images: {path: string; alt: string}[]; slug: string; published_at: Date }

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const path = `${owner}/44444444-4444-4444-8444-444444444444.webp`;
test('database permissions, snapshots, validation and conflicts', async () => {
  const migration=await readFile(new URL('../supabase/migrations/202611200001_private_editor.sql', import.meta.url),'utf8');
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text, unique(bucket_id,name));
      alter table storage.objects enable row level security;
      create policy legacy_broad_access on storage.objects for all to anon,authenticated using(true) with check(true);
      grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    await db.exec(migration);
    await db.exec(await readFile(new URL('../supabase/tests/access-check.sql', import.meta.url),'utf8'));
    const bucket=(await db.query<BucketRow>("select * from storage.buckets where id='rb-studio-images'")).rows[0];
    assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),8388608);
    assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
    const functions=await db.query<FunctionRow>("select prosecdef, proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('rb_is_owner','rb_save_draft','rb_publish_draft','rb_unpublish_post')");
    assert.equal(functions.rows.length,4);
    for(const fn of functions.rows){ assert.equal(fn.prosecdef,true); assert.deepEqual(fn.proconfig,['search_path=""']); }
    await db.query('insert into public.rb_studio_owners values ($1)', [owner]);
    const role = async (who: string | null) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who ?? '']); await db.exec(`set role ${who ? 'authenticated' : 'anon'}`); };
    const save = (title='Title', body='Body', images: unknown=[], revision=0) => db.query<DraftRow>('select * from public.rb_save_draft($1,$2,$3,$4,$5)',[id,title,body,JSON.stringify(images),revision]);
    for (const who of [null,other]) {
      await role(who);
      await assert.rejects(save());
      await assert.rejects(db.query('select public.rb_publish_draft($1,1)',[id]));
      await assert.rejects(db.query('select public.rb_unpublish_post($1)',[id]));
      await assert.rejects(db.query('insert into public.rb_studio_owners values ($1)',[other]));
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('rb-studio-images',$1)",[`${other}/44444444-4444-4444-8444-444444444444.webp`]));
    }
    await role(owner);
    assert.equal((await save('Title','Body',[{path,alt:'First'}])).rows[0].revision,1);
    await assert.rejects(save('Clobber','Body',[],0),/conflict/i);
    await db.query("insert into storage.objects(bucket_id,name) values ('rb-studio-images',$1)",[path]);
    await role(null);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await role(other);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length,0);
    assert.equal((await db.query("update storage.objects set name='stolen' returning *")).rows.length,0);
    await role(owner);
    await db.query('select public.rb_publish_draft($1,1)',[id]);
    const first = (await db.query<PostRow>('select * from public.rb_posts')).rows[0];
    await save('Changed','Secret',[],1);
    for (const who of [null,other]) {
      await role(who);
      assert.equal((await db.query('select * from public.rb_drafts')).rows.length,0);
      assert.equal((await db.query('select * from public.rb_studio_owners')).rows.length,0);
      const post = (await db.query<PostRow>('select * from public.rb_posts')).rows[0];
      assert.equal(post.body,'Body'); assert.deepEqual(post.images,[{path,alt:'First'}]);
      assert.equal((await db.query('select * from storage.objects')).rows.length,1);
      await assert.rejects(db.query('delete from public.rb_posts'));
    }
    await role(owner);
    assert.equal((await db.query('select * from public.rb_drafts')).rows.length,1);
    await assert.rejects(db.query('update public.rb_drafts set body=\'bypass\''));
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('rb-studio-images',$1)",[`${other}/44444444-4444-4444-8444-444444444444.webp`]));
    assert.equal((await db.query('update storage.objects set name=\'overwrite\' returning *')).rows.length,0);
    for (const [title,body,images] of [ ['', '', []], ['x'.repeat(161),'',[]], ['', 'x'.repeat(30001),[]], ['a','b',{}], ['a','b',[{path,alt:'a'.repeat(301)}]], ['a','b',[{path,alt:''},{path,alt:''}]], ['a','b',[{path:`${other}/44444444-4444-4444-8444-444444444444.webp`,alt:''}]], ['a','b',Array.from({length:5},()=>({path,alt:''}))], ['a','b',[{path:'../secret',alt:''}]], ['a','b',[{path,alt:1}]] ] as const) {
      await assert.rejects(save(title,body,images,2),/invalid|empty|limit/i);
    }
    await assert.rejects(db.query('select public.rb_publish_draft($1,1)',[id]),/conflict/i);
    await db.query('select public.rb_publish_draft($1,2)',[id]);
    const updated=(await db.query<PostRow>('select * from public.rb_posts')).rows[0];
    assert.equal(updated.slug,first.slug); assert.deepEqual(updated.published_at,first.published_at);
    await save('','Only body',[],2);
    await assert.rejects(db.query('select public.rb_publish_draft($1,3)',[id]),/title|body/i);
    await db.query('select public.rb_unpublish_post($1)',[id]);
    await role(null);
    assert.equal((await db.query('select * from public.rb_posts')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await role(owner);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length,1);
  } finally { await db.close(); }
});
