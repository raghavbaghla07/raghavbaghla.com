begin;

create table public.rb_studio_owners (user_id uuid primary key);
create table public.rb_drafts (
  id uuid primary key,
  title text not null default '',
  body text not null default '',
  images jsonb not null default '[]'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.rb_posts (
  id uuid primary key references public.rb_drafts(id),
  slug text not null unique,
  title text not null,
  body text not null,
  images jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rb_studio_owners enable row level security;
alter table public.rb_drafts enable row level security;
alter table public.rb_posts enable row level security;
revoke all on public.rb_studio_owners, public.rb_drafts, public.rb_posts from public, anon, authenticated;
grant select on public.rb_studio_owners, public.rb_drafts to authenticated;
grant select on public.rb_posts to anon, authenticated;
-- SELECT grants are harmless for anon and make private-list queries return no rows.
grant select on public.rb_studio_owners, public.rb_drafts to anon;

create function public.rb_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (
  select 1 from public.rb_studio_owners where user_id = auth.uid()
) $$;

create policy rb_owner_membership_read on public.rb_studio_owners for select to authenticated
using (user_id = auth.uid());
create policy rb_owner_drafts_read on public.rb_drafts for select to authenticated
using (public.rb_is_owner());
create policy rb_public_posts_read on public.rb_posts for select to anon, authenticated using (true);

create function public.rb_save_draft(p_id uuid, p_title text, p_body text, p_images jsonb, p_expected_revision integer)
returns public.rb_drafts language plpgsql security definer set search_path = '' as $$
declare
  saved public.rb_drafts;
  item jsonb;
  seen text[] := array[]::text[];
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_id is null or p_title is null or p_body is null or p_images is null
    or length(p_title)>160 or length(p_body)>30000 then raise exception 'Invalid draft limits'; end if;
  if jsonb_typeof(p_images) <> 'array' then raise exception 'Invalid images array'; end if;
  if jsonb_array_length(p_images)>4 then raise exception 'Invalid images limit'; end if;
  if btrim(p_title)='' and btrim(p_body)='' and jsonb_array_length(p_images)=0 then raise exception 'Empty draft'; end if;
  for item in select value from jsonb_array_elements(p_images) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'path') is distinct from 'string'
      or jsonb_typeof(item->'alt') is distinct from 'string'
      or length(item->>'alt')>300
      or (item->>'path') !~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$')
      or (item->>'path') = any(seen)
      or (item - 'path' - 'alt') <> '{}'::jsonb
    then raise exception 'Invalid image path or alt'; end if;
    seen := array_append(seen,item->>'path');
  end loop;
  -- Serializes both first inserts and later updates for the same draft id.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  select * into saved from public.rb_drafts where id=p_id for update;
  if found then
    if p_expected_revision is distinct from saved.revision then raise exception 'Revision conflict: reload the saved draft'; end if;
    update public.rb_drafts set title=p_title,body=p_body,images=p_images,
      revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into saved;
  else
    if p_expected_revision is distinct from 0 then raise exception 'Revision conflict: draft does not exist'; end if;
    insert into public.rb_drafts(id,title,body,images) values(p_id,p_title,p_body,p_images) returning * into saved;
  end if;
  return saved;
end $$;

create function public.rb_publish_draft(p_id uuid,p_expected_revision integer)
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
  insert into public.rb_posts(id,slug,title,body,images) values(draft.id,new_slug,draft.title,draft.body,draft.images)
  on conflict (id) do update set title=excluded.title,body=excluded.body,images=excluded.images,updated_at=clock_timestamp()
  returning * into published;
  return published;
end $$;

create function public.rb_unpublish_post(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  delete from public.rb_posts where id=p_id;
end $$;

revoke all on function public.rb_is_owner(), public.rb_save_draft(uuid,text,text,jsonb,integer),
  public.rb_publish_draft(uuid,integer),public.rb_unpublish_post(uuid) from public,anon,authenticated;
grant execute on function public.rb_is_owner() to anon,authenticated;
grant execute on function public.rb_save_draft(uuid,text,text,jsonb,integer),
  public.rb_publish_draft(uuid,integer),public.rb_unpublish_post(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rb-studio-images','rb-studio-images',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy rb_images_read on storage.objects for select to anon, authenticated using (
  bucket_id='rb-studio-images' and (
    (public.rb_is_owner() and split_part(name,'/',1)=auth.uid()::text)
    or exists (select 1 from public.rb_posts p cross join lateral jsonb_array_elements(p.images) image where image->>'path'=name)
  )
);
create policy rb_images_insert on storage.objects for insert to authenticated with check (
  bucket_id='rb-studio-images' and public.rb_is_owner()
  and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$')
);
create policy rb_images_delete on storage.objects for delete to authenticated using (
  bucket_id='rb-studio-images' and public.rb_is_owner() and split_part(name,'/',1)=auth.uid()::text
);
-- Existing permissive policies are ORed by PostgreSQL. These restrictive guards
-- protect this new bucket even if an older unrelated bucket has a broad policy.
create policy rb_images_read_guard on storage.objects as restrictive for select to anon,authenticated using (
  bucket_id <> 'rb-studio-images' or (
    (public.rb_is_owner() and split_part(name,'/',1)=auth.uid()::text)
    or exists (select 1 from public.rb_posts p cross join lateral jsonb_array_elements(p.images) image where image->>'path'=name)
  )
);
create policy rb_images_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check (
  bucket_id <> 'rb-studio-images' or (public.rb_is_owner()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$'))
);
create policy rb_images_update_guard on storage.objects as restrictive for update to anon,authenticated
using (bucket_id <> 'rb-studio-images') with check (bucket_id <> 'rb-studio-images');
create policy rb_images_delete_guard on storage.objects as restrictive for delete to anon,authenticated using (
  bucket_id <> 'rb-studio-images' or (public.rb_is_owner() and split_part(name,'/',1)=auth.uid()::text)
);
commit;
