-- Apply after schema.sql. Guests do not need Supabase accounts.
alter table public.comments alter column user_id drop not null;
alter table public.comments add column visitor_id uuid;
drop policy "Readers submit pending comments" on public.comments;
revoke insert on public.comments from authenticated;
revoke insert (post_id,user_id,name,body) on public.comments from authenticated;
drop trigger comment_rate_limit on public.comments;
revoke execute on function public.toggle_like(uuid) from authenticated;

create table public.guest_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_id uuid not null,
  primary key(post_id,visitor_id)
);
create table public.guest_events (
  visitor_id uuid not null,
  fingerprint text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.guest_likes enable row level security;
alter table public.guest_events enable row level security;
revoke all on public.guest_likes, public.guest_events from anon, authenticated;
create index guest_events_fingerprint_date on public.guest_events(fingerprint,created_at);
create index guest_events_visitor_date on public.guest_events(visitor_id,created_at);
create index guest_events_date on public.guest_events(created_at);

create function public.guest_stats(target uuid, visitor uuid) returns table(likes bigint, comments bigint, liked boolean)
language sql stable security definer set search_path = '' as $$
 select (select count(*) from public.guest_likes where post_id = target),
        (select count(*) from public.comments where post_id = target and approved),
        exists(select 1 from public.guest_likes where post_id = target and visitor_id = visitor)
 where exists(select 1 from public.posts where id = target and published);
$$;
revoke all on function public.guest_stats(uuid,uuid) from public, anon, authenticated;
grant execute on function public.guest_stats(uuid,uuid) to service_role;

create function public.guest_action(target uuid, visitor uuid, fingerprint text, operation text, guest_name text default null, guest_body text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.posts where id = target and published) then raise exception 'Post unavailable'; end if;
 if operation not in ('like','comment') then raise exception 'Unknown action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(fingerprint,0));
 perform pg_advisory_xact_lock(hashtextextended(visitor::text,1));
 if (select count(*) from public.guest_events e where e.fingerprint = guest_action.fingerprint and e.created_at > now() - interval '1 hour') >= 60 then raise exception 'Rate limited'; end if;
 if operation = 'comment' and (select count(*) from public.guest_events e where (e.fingerprint = guest_action.fingerprint or e.visitor_id = visitor) and e.kind = 'comment' and e.created_at > now() - interval '1 hour') >= 5 then raise exception 'Rate limited'; end if;
 insert into public.guest_events(visitor_id,fingerprint,kind) values(visitor,fingerprint,operation);
 delete from public.guest_events where created_at < now() - interval '1 day';
 if operation = 'like' then
   if exists(select 1 from public.guest_likes where post_id = target and visitor_id = visitor) then
     delete from public.guest_likes where post_id = target and visitor_id = visitor;
   else
     insert into public.guest_likes(post_id,visitor_id) values(target,visitor);
   end if;
 else
   insert into public.comments(post_id,visitor_id,name,body) values(target,visitor,trim(guest_name),trim(guest_body));
 end if;
end;
$$;
revoke all on function public.guest_action(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.guest_action(uuid,uuid,text,text,text,text) to service_role;
