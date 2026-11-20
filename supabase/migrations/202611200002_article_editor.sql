begin;

-- Additive: existing rows remain plain text until explicitly saved in the studio.
alter table public.rb_drafts add column article jsonb;
alter table public.rb_posts add column article jsonb;

create function public.rb_save_article(p_id uuid,p_title text,p_body text,p_images jsonb,p_article jsonb,p_expected_revision integer)
returns public.rb_drafts language plpgsql security definer set search_path = '' as $$
declare
  saved public.rb_drafts;
  item jsonb;
  seen text[] := array[]::text[];
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_id is null or p_title is null or p_body is null or p_images is null
    or length(p_title)>160 or length(p_body)>100000 then raise exception 'Invalid draft limits'; end if;
  if jsonb_typeof(p_images) is distinct from 'array' then raise exception 'Invalid images array'; end if;
  if jsonb_array_length(p_images)>20 then raise exception 'Invalid images limit'; end if;
  if btrim(p_title)='' and btrim(p_body)='' and jsonb_array_length(p_images)=0 then raise exception 'Empty draft'; end if;
  for item in select value from jsonb_array_elements(p_images) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'path') is distinct from 'string'
      or jsonb_typeof(item->'alt') is distinct from 'string' or length(item->>'alt')>300
      or (item->>'path') !~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$')
      or (item->>'path') = any(seen) or (item - 'path' - 'alt') <> '{}'::jsonb
    then raise exception 'Invalid image path or alt'; end if;
    seen := array_append(seen,item->>'path');
  end loop;
  -- SQL checks the bounded envelope. The application validates and renders only
  -- allowlisted document nodes/attributes; saved JSON is never trusted HTML.
  if jsonb_typeof(p_article) is distinct from 'object'
    or p_article->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_article->'doc') is distinct from 'object'
    or jsonb_typeof(p_article->'summary') is distinct from 'string'
    or length(p_article->>'summary')>320
    or jsonb_typeof(p_article->'tags') is distinct from 'array'
    or octet_length(p_article::text)>1048576
    or (p_article - 'version' - 'doc' - 'summary' - 'tags' - 'cover') <> '{}'::jsonb
  then raise exception 'Invalid article envelope or limits'; end if;
  if jsonb_array_length(p_article->'tags')>8 then raise exception 'Invalid article tags limit'; end if;
  for item in select value from jsonb_array_elements(p_article->'tags') loop
    if jsonb_typeof(item) is distinct from 'string' or length(item #>> '{}')>40 then raise exception 'Invalid article tag'; end if;
  end loop;
  if p_article ? 'cover' and p_article->'cover' <> 'null'::jsonb then
    if jsonb_typeof(p_article->'cover') is distinct from 'string'
      or not ((p_article->>'cover') = any(seen)) then raise exception 'Invalid article cover'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  select * into saved from public.rb_drafts where id=p_id for update;
  if found then
    if p_expected_revision is distinct from saved.revision then raise exception 'Revision conflict: reload the saved draft'; end if;
    update public.rb_drafts set title=p_title,body=p_body,images=p_images,article=p_article,
      revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
  else
    if p_expected_revision is distinct from 0 then raise exception 'Revision conflict: draft does not exist'; end if;
    insert into public.rb_drafts(id,title,body,images,article) values(p_id,p_title,p_body,p_images,p_article) returning * into saved;
  end if;
  return saved;
end $$;

-- Keep the old signature for older clients. Reuse validation/locking, then clear
-- formatting atomically so a plain-text save cannot retain stale rich content.
create or replace function public.rb_save_draft(p_id uuid,p_title text,p_body text,p_images jsonb,p_expected_revision integer)
returns public.rb_drafts language plpgsql security definer set search_path = '' as $$
declare saved public.rb_drafts;
begin
  saved := public.rb_save_article(p_id,p_title,p_body,p_images,
    '{"version":1,"doc":{"type":"doc"},"summary":"","tags":[],"cover":null}'::jsonb,p_expected_revision);
  update public.rb_drafts set article=null where id=saved.id returning * into saved;
  return saved;
end $$;

create or replace function public.rb_publish_draft(p_id uuid,p_expected_revision integer)
returns public.rb_posts language plpgsql security definer set search_path = '' as $$
declare draft public.rb_drafts; published public.rb_posts; new_slug text;
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  select * into draft from public.rb_drafts where id=p_id for update;
  if not found or p_expected_revision is distinct from draft.revision then raise exception 'Revision conflict: reload the saved draft'; end if;
  if btrim(draft.title)='' or btrim(draft.body)='' then raise exception 'Title and body are required to publish'; end if;
  new_slug := trim(both '-' from regexp_replace(lower(draft.title),'[^a-z0-9]+','-','g'));
  if new_slug='' then new_slug := 'post'; end if;
  new_slug := new_slug || '-' || p_id::text;
  insert into public.rb_posts(id,slug,title,body,images,article) values(draft.id,new_slug,draft.title,draft.body,draft.images,draft.article)
  on conflict (id) do update set title=excluded.title,body=excluded.body,images=excluded.images,article=excluded.article,updated_at=clock_timestamp()
  returning * into published;
  return published;
end $$;

revoke all on function public.rb_save_article(uuid,text,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.rb_save_article(uuid,text,text,jsonb,jsonb,integer) to authenticated;
-- CREATE OR REPLACE retains the existing legacy/publish grants and all policies.
commit;
