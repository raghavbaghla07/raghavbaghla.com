-- Run once in a new Supabase project's SQL Editor.
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
create policy "Owner can read own membership" on public.admins for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 200),
  title text not null check (length(trim(title)) between 1 and 200),
  excerpt text not null check (length(trim(excerpt)) between 1 and 500),
  category text not null check (category in ('Ad copy','Social posts','Campaign concepts','Notes')),
  color text not null default 'peach' check (color in ('peach','lavender','lime','blue')),
  content jsonb not null default '{"type":"doc","content":[]}' check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 500000),
  cover_url text,
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 20),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "Read published work or owner drafts" on public.posts for select using (published or (select public.is_admin()));
create policy "Owner creates posts" on public.posts for insert to authenticated with check ((select public.is_admin()));
create policy "Owner edits posts" on public.posts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner deletes posts" on public.posts for delete to authenticated using ((select public.is_admin()));
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
create index posts_published_date on public.posts (created_at desc) where published;

create table public.likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (post_id,user_id)
);
alter table public.likes enable row level security;
revoke all on public.likes from anon, authenticated;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  body text not null check (length(trim(body)) between 3 and 2000),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create policy "Read approved comments or owner moderation" on public.comments for select using ((approved and exists(select 1 from public.posts where id = post_id and published)) or (select public.is_admin()));
create policy "Readers submit pending comments" on public.comments for insert to authenticated with check (user_id = (select auth.uid()) and not approved and exists(select 1 from public.posts where id = post_id and published));
create policy "Owner approves comments" on public.comments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner removes comments" on public.comments for delete to authenticated using ((select public.is_admin()));
revoke all on public.comments from anon, authenticated;
grant select (id,post_id,name,body,approved,created_at) on public.comments to anon, authenticated;
grant insert (post_id,user_id,name,body) on public.comments to authenticated;
grant update (approved), delete on public.comments to authenticated;
create index comments_post_date on public.comments(post_id, created_at desc);
create index comments_user_date on public.comments(user_id, created_at desc);

create function public.limit_comments() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.comments where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Please wait before posting another comment';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_comments() from public, anon, authenticated;
create trigger comment_rate_limit before insert on public.comments for each row execute function public.limit_comments();

create function public.post_stats(target uuid) returns table(likes bigint, comments bigint, liked boolean) language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.likes where post_id = target),
         (select count(*) from public.comments where post_id = target and approved),
         exists(select 1 from public.likes where post_id = target and user_id = auth.uid())
  where exists(select 1 from public.posts where id = target and published);
$$;
revoke all on function public.post_stats(uuid) from public;
grant execute on function public.post_stats(uuid) to anon, authenticated;
create function public.toggle_like(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Sign in to like a post'; end if;
  if not exists(select 1 from public.posts where id = target and published) then raise exception 'Post unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text || viewer::text, 0));
  if exists(select 1 from public.likes where post_id = target and user_id = viewer) then
    delete from public.likes where post_id = target and user_id = viewer;
  else
    insert into public.likes(post_id,user_id) values(target,viewer);
  end if;
end;
$$;
revoke all on function public.toggle_like(uuid) from public, anon;
grant execute on function public.toggle_like(uuid) to authenticated;

-- After creating your owner account in Authentication > Users, replace OWNER_USER_UUID:
-- insert into public.admins(user_id) values ('OWNER_USER_UUID');
