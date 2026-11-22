begin;

create table public.rb_post_likes (
  post_id uuid not null references public.rb_drafts(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (post_id, visitor_id)
);
create table public.rb_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.rb_drafts(id) on delete cascade,
  visitor_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  body text not null check (length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default clock_timestamp()
);
create index rb_comments_public_order on public.rb_comments(post_id, status, created_at desc, id desc);
create index rb_comments_visitor_rate on public.rb_comments(visitor_id, created_at desc);
alter table public.rb_post_likes enable row level security;
alter table public.rb_comments enable row level security;
-- All access is through bounded functions; visitor identifiers and pending
-- comments are never exposed through public table queries.
revoke all on public.rb_post_likes, public.rb_comments from public, anon, authenticated;

create function public.rb_post_engagement(p_post_id uuid, p_visitor_id uuid)
returns table(likes integer, liked boolean, comments integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::integer from public.rb_post_likes l where l.post_id=p_post_id),
    exists(select 1 from public.rb_post_likes l where l.post_id=p_post_id and l.visitor_id=p_visitor_id),
    (select count(*)::integer from public.rb_comments c where c.post_id=p_post_id and c.status='approved')
  where exists(select 1 from public.rb_posts where id=p_post_id)
$$;

create function public.rb_set_post_like(p_post_id uuid, p_visitor_id uuid, p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_visitor_id is null or p_liked is null then raise exception 'Invalid visitor'; end if;
  -- Lock the published row against unpublishing while recording an interaction.
  perform 1 from public.rb_posts where id=p_post_id for key share;
  if not found then raise exception 'This article is no longer published'; end if;
  if p_liked then
    insert into public.rb_post_likes(post_id,visitor_id) values(p_post_id,p_visitor_id) on conflict do nothing;
  else
    delete from public.rb_post_likes where post_id=p_post_id and visitor_id=p_visitor_id;
  end if;
end $$;

create function public.rb_submit_comment(p_post_id uuid, p_visitor_id uuid, p_display_name text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare comment_id uuid;
begin
  if p_visitor_id is null or p_display_name is null or p_body is null
    or length(btrim(p_display_name)) not between 1 and 60
    or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Invalid comment limits'; end if;
  perform 1 from public.rb_posts where id=p_post_id for key share;
  if not found then raise exception 'This article is no longer published'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_id::text,1));
  if exists(select 1 from public.rb_comments where visitor_id=p_visitor_id and created_at>clock_timestamp()-interval '1 minute')
    or (select count(*) from public.rb_comments where visitor_id=p_visitor_id and status='pending')>=5
    or (select count(*) from public.rb_comments where visitor_id=p_visitor_id and created_at>clock_timestamp()-interval '1 hour')>=10
  then raise exception 'Please wait before sending another comment'; end if;
  insert into public.rb_comments(post_id,visitor_id,display_name,body)
  values(p_post_id,p_visitor_id,btrim(p_display_name),btrim(p_body)) returning id into comment_id;
  return comment_id;
end $$;

create function public.rb_list_comments(p_post_id uuid, p_offset integer default 0)
returns table(id uuid,display_name text,body text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'Invalid page'; end if;
  return query select c.id,c.display_name,c.body,c.created_at from public.rb_comments c
    join public.rb_posts p on p.id=c.post_id
    where c.post_id=p_post_id and c.status='approved'
    order by c.created_at desc,c.id desc limit 20 offset p_offset;
end $$;

create function public.rb_review_comments(p_post_id uuid, p_offset integer default 0)
returns table(id uuid,display_name text,body text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'Invalid page'; end if;
  return query select c.id,c.display_name,c.body,c.status,c.created_at from public.rb_comments c
    where c.post_id=p_post_id order by (c.status='pending') desc,c.created_at desc,c.id desc limit 100 offset p_offset;
end $$;

create function public.rb_moderate_comment(p_comment_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_status is null or p_status not in ('approved','rejected') then raise exception 'Invalid moderation status'; end if;
  update public.rb_comments set status=p_status where id=p_comment_id;
  if not found then raise exception 'Comment no longer exists'; end if;
end $$;

revoke all on function public.rb_post_engagement(uuid,uuid), public.rb_set_post_like(uuid,uuid,boolean),
  public.rb_submit_comment(uuid,uuid,text,text), public.rb_list_comments(uuid,integer),
  public.rb_review_comments(uuid,integer), public.rb_moderate_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.rb_post_engagement(uuid,uuid), public.rb_set_post_like(uuid,uuid,boolean),
  public.rb_submit_comment(uuid,uuid,text,text), public.rb_list_comments(uuid,integer) to anon,authenticated;
grant execute on function public.rb_review_comments(uuid,integer), public.rb_moderate_comment(uuid,text) to authenticated;

commit;
