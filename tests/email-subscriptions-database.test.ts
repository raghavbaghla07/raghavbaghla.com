import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('only confirmed readers receive the first publication and unsubscribing cancels delivery', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const existing = '22222222-2222-4222-8222-222222222222';
  const article = '33333333-3333-4333-8333-333333333333';
  const nextArticle = '44444444-4444-4444-8444-444444444444';
  const queuedArticle = '55555555-5555-4555-8555-555555555555';
  async function migrate(filename: string) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;`);
    for (const file of ['202611200001_private_editor.sql', '202611200002_article_editor.sql', '202611220001_article_engagement.sql', '202611220002_delete_article.sql', '202611230001_readership.sql']) await migrate(file);
    await db.query('insert into public.rb_studio_owners values ($1)', [owner]);
    for (const id of [existing, article, nextArticle, queuedArticle]) {
      await db.query("insert into public.rb_drafts(id,title,body) values ($1,'A thought','The article body')", [id]);
    }
    const publish = (id: string) => db.query('select public.rb_publish_draft($1,1)', [id]);
    const unpublish = (id: string) => db.query('select public.rb_unpublish_post($1)', [id]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await publish(existing);
    await migrate('202611240001_email_subscriptions.sql');
    await migrate('202611240002_studio_analytics.sql');
    await migrate('202611240004_afterthoughts_topic_follow.sql');
    await migrate('202611240005_instant_afterthoughts_follow.sql');
    const claim = async () => (await db.query<{id:string;email:string;unsubscribe:string}>('select * from public.rb_claim_article_email()')).rows[0];
    const signup = async (email: string) => (await db.query<{token:string|null}>(
      "select public.rb_request_email_subscription($1,'ip-hash') as token", [email])).rows[0].token;
    const count = async () => (await db.query<{subscribers:number}>(
      "select (public.rb_readership(7)->>'email_subscribers')::integer as subscribers")).rows[0].subscribers;
    const follow = async (email: string) => (await db.query<{active:boolean}>(
      "select public.rb_follow_afterthoughts($1,'instant-follow-test',null,null) as active", [email])).rows[0].active;

    await db.exec('set role anon');
    await assert.rejects(signup('first@example.com'), /permission/i);
    await assert.rejects(follow('first@example.com'), /permission/i);
    await assert.rejects(claim(), /permission/i);
    await assert.rejects(db.query('select email from public.rb_email_subscriptions'), /permission/i);
    await db.exec('set role service_role');
    const token = await signup('first@example.com');
    assert.ok(token);
    assert.equal(await signup('first@example.com'), null);
    await signup('pending@example.com');
    const confirm = await db.query<{confirmed:boolean}>('select public.rb_confirm_email_subscription($1) as confirmed', [token]);
    assert.equal(confirm.rows[0].confirmed, true);
    assert.equal(await claim(), undefined);

    await db.exec('reset role');
    await db.query("insert into public.rb_drafts(id,title,body) values ($1,'Another topic','Body')", [crypto.randomUUID()]);
    await db.exec(`insert into public.rb_posts(id,slug,title,body,email_topic)
      select id,'another-topic',title,body,null from public.rb_drafts where title='Another topic'`);
    await db.exec('set role service_role');
    assert.equal(await claim(), undefined);

    await db.exec('set role authenticated');
    assert.equal(await count(), 1);
    await unpublish(existing);
    await publish(existing);
    await publish(article);
    await publish(article);
    await db.exec('set role service_role');
    const delivery = await claim();
    assert.equal(delivery?.email, 'first@example.com');
    assert.equal(await claim(), undefined);
    // A failed/abandoned lease retries the same delivery and idempotency key.
    await db.query("update public.rb_article_emails set available_at=now() where id=$1", [delivery.id]);
    assert.equal((await claim())?.id, delivery.id);
    await db.query('update public.rb_article_emails set sent_at=now() where id=$1', [delivery.id]);

    await db.exec('set role authenticated');
    await unpublish(article);
    await publish(article);
    await publish(nextArticle);
    await unpublish(nextArticle);
    await publish(nextArticle);
    await db.exec('set role service_role');
    assert.equal(await claim(), undefined);
    await db.exec('set role authenticated');
    await publish(queuedArticle);
    await db.exec('set role service_role');
    await db.query('select public.rb_unsubscribe_email($1)', [delivery.unsubscribe]);
    assert.equal(await claim(), undefined);
    await db.exec('set role authenticated');
    assert.equal(await count(), 0);
    await assert.rejects(follow('pending@example.com'), /permission/i);
    await db.exec('set role service_role');
    assert.equal(await follow('pending@example.com'), true);
    assert.equal(await follow('new@example.com'), true);
    for (let retry = 0; retry < 6; retry++) assert.equal(await follow('new@example.com'), true);
    assert.equal(await follow('blocked@example.com'), false);
    await db.exec('reset role');
    assert.deepEqual((await db.query("select email,confirmation from public.rb_email_subscriptions where confirmed_at is not null order by email")).rows,
      [{email:'new@example.com',confirmation:null},{email:'pending@example.com',confirmation:null}]);
    const newPost = crypto.randomUUID();
    await db.query("insert into public.rb_drafts(id,title,body) values ($1,'Instant follow test','Body')", [newPost]);
    await db.exec('set role authenticated');
    assert.equal(await count(), 2);
    await publish(newPost);
    await db.exec('set role service_role');
    const recipients = [(await claim())?.email, (await claim())?.email];
    assert.deepEqual(recipients.sort(), ['new@example.com','pending@example.com']);
    assert.equal(await claim(), undefined);

    await db.exec('reset role');
    await migrate('202611240006_afterthoughts_welcome_email.sql');
    const followWithWelcome = async (email: string) => (await db.query<{active:boolean;welcome_token:string|null}>(
      "select * from public.rb_follow_afterthoughts_with_welcome($1,'welcome-test',null,null)", [email])).rows[0];
    await db.exec('set role anon');
    await assert.rejects(followWithWelcome('welcome@example.com'), /permission/i);
    await db.exec('set role service_role');
    assert.deepEqual(await followWithWelcome('new@example.com'), {active:true,welcome_token:null});
    const welcome = await followWithWelcome('welcome@example.com');
    assert.equal(welcome.active, true);
    assert.ok(welcome.welcome_token);
    assert.deepEqual(await followWithWelcome('welcome@example.com'), welcome);
    await db.query('select public.rb_record_welcome_sent($1)',[welcome.welcome_token]);
    assert.deepEqual(await followWithWelcome('welcome@example.com'), {active:true,welcome_token:null});
  } finally {
    await db.close();
  }
});
