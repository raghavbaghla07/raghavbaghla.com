import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('visitor interactions keep moderation private, enforce limits, and never grant editor access', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const post = '33333333-3333-4333-8333-333333333333';
  const visitor = '44444444-4444-4444-8444-444444444444';
  const secondVisitor = '55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;`);
    for (const file of ['202611200001_private_editor.sql', '202611200002_article_editor.sql', '202611220001_article_engagement.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db.query('insert into public.rb_studio_owners values ($1)', [owner]);
    await db.query("insert into public.rb_drafts(id,title,body) values ($1,'Sample','Body')", [post]);
    await db.query("insert into public.rb_posts(id,slug,title,body) values ($1,'sample','Sample','Body')", [post]);
    const role = async (who: string | null) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who ?? '']);
      await db.exec(`set role ${who ? 'authenticated' : 'anon'}`);
    };
    const stats = async () => (await db.query<{likes:number;liked:boolean;comments:number}>('select * from public.rb_post_engagement($1,$2)', [post, visitor])).rows[0];
    const like = (liked: boolean, who = visitor) => db.query('select public.rb_set_post_like($1,$2,$3)', [post, who, liked]);
    const submit = (name = 'Reader', body = 'A useful note.', who = visitor) => db.query<{id:string}>('select public.rb_submit_comment($1,$2,$3,$4) as id', [post, who, name, body]);
    const comments = () => db.query<{id:string;display_name:string;body:string}>('select * from public.rb_list_comments($1,0)', [post]);
    await role(null);
    assert.deepEqual(await stats(), {likes:0,liked:false,comments:0});
    await like(true); await like(true);
    assert.deepEqual(await stats(), {likes:1,liked:true,comments:0});
    await like(true, secondVisitor);
    assert.equal((await stats()).likes, 2);
    await like(false); await like(false);
    assert.deepEqual(await stats(), {likes:1,liked:false,comments:0});
    await assert.rejects(db.query('select * from public.rb_post_likes'), /permission/i);
    await assert.rejects(db.query('select * from public.rb_comments'), /permission/i);
    await assert.rejects(db.query('insert into public.rb_studio_owners values ($1)', [other]), /permission/i);
    await assert.rejects(db.query('select public.rb_publish_draft($1,1)', [post]), /permission|owner/i);
    for (const [name, body] of [['', 'Hi'], ['A', ' '], ['A'.repeat(61), 'Hi'], ['A', 'x'.repeat(2001)]]) {
      await assert.rejects(submit(name, body), /limit|invalid/i);
    }
    await assert.rejects(like(true, null as unknown as string), /invalid/i);
    const id = (await submit('  Reader  ', '<script>alert(1)</script> is literal text.')).rows[0].id;
    assert.equal((await comments()).rows.length, 0);
    assert.equal((await stats()).comments, 0);
    await assert.rejects(submit(), /wait/i);
    await assert.rejects(db.query("select public.rb_moderate_comment($1,'approved')", [id]), /permission|owner/i);
    await role(other);
    await assert.rejects(db.query('select * from public.rb_review_comments($1)', [post]), /owner/i);
    await assert.rejects(db.query("select public.rb_moderate_comment($1,'approved')", [id]), /owner/i);
    await role(owner);
    const pending = (await db.query<{id:string;status:string}>('select * from public.rb_review_comments($1)', [post])).rows;
    assert.equal(pending.length, 1); assert.equal(pending[0].status, 'pending');
    await assert.rejects(db.query("select public.rb_moderate_comment($1,'anything')", [id]), /invalid/i);
    await db.query("select public.rb_moderate_comment($1,'approved')", [id]);
    await role(null);
    const visible = (await comments()).rows;
    assert.equal(visible.length, 1); assert.equal(visible[0].display_name, 'Reader');
    assert.equal(visible[0].body, '<script>alert(1)</script> is literal text.');
    assert.ok(!('visitor_id' in visible[0]) && !('status' in visible[0]));
    assert.equal((await stats()).comments, 1);
    await assert.rejects(db.query('select * from public.rb_list_comments($1,-1)', [post]), /invalid/i);
    await role(owner);
    await db.query("select public.rb_moderate_comment($1,'rejected')", [id]);
    await role(null); assert.equal((await comments()).rows.length, 0);
    await role(owner);
    await db.exec('reset role');
    await db.query("insert into public.rb_comments(post_id,visitor_id,display_name,body,status) select $1,$2,'Another reader','Archived comment','rejected' from generate_series(1,100)",[post,secondVisitor]);
    await role(owner);
    const firstReviewPage = (await db.query<{id:string}>('select * from public.rb_review_comments($1,0)',[post])).rows;
    const nextReviewPage = (await db.query<{id:string}>('select * from public.rb_review_comments($1,100)',[post])).rows;
    assert.equal(firstReviewPage.length,100); assert.equal(nextReviewPage.length,1);
    assert.equal(nextReviewPage[0].id,id);
    await assert.rejects(db.query('select * from public.rb_review_comments($1,-1)',[post]),/invalid/i);
    await db.query('select public.rb_unpublish_post($1)', [post]);
    await role(null);
    await assert.rejects(like(true), /published/i);
    await assert.rejects(submit('Reader', 'Another note', secondVisitor), /published/i);
    assert.equal((await comments()).rows.length, 0);
    await db.exec('reset role');
    // Unpublishing hides interactions without destroying the article's history.
    assert.equal((await db.query('select * from public.rb_post_likes')).rows.length, 1);
    assert.equal((await db.query('select * from public.rb_comments')).rows.length, 101);
    await db.query('delete from public.rb_drafts where id=$1', [post]);
    assert.equal((await db.query('select * from public.rb_post_likes')).rows.length, 0);
    assert.equal((await db.query('select * from public.rb_comments')).rows.length, 0);
  } finally { await db.close(); }
});
