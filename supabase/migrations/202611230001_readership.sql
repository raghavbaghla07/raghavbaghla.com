begin;

create table public.rb_feeds (
  token uuid primary key,
  last_requested timestamptz
);
create table public.rb_visits (
  id uuid primary key,
  visitor uuid not null,
  page text not null,
  post_id uuid references public.rb_drafts on delete cascade,
  started timestamptz not null default now(),
  seconds integer not null,
  depth integer not null,
  source text not null
);
create index rb_visits_started on public.rb_visits(started);
create table public.rb_link_clicks (
  id uuid primary key,
  visit uuid not null references public.rb_visits on delete cascade,
  destination text not null
);
create index rb_link_visit on public.rb_link_clicks(visit);
alter table public.rb_feeds enable row level security;
alter table public.rb_visits enable row level security;
alter table public.rb_link_clicks enable row level security;
revoke all on public.rb_feeds, public.rb_visits, public.rb_link_clicks from public, anon, authenticated;

-- A feed counts only after its private URL has actually been requested.
create function public.rb_feed(p_token uuid, p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_action='create' then
    insert into public.rb_feeds(token) values(p_token) on conflict do nothing;
  elsif p_action='remove' then
    delete from public.rb_feeds where token=p_token;
  elsif p_action='read' then
    update public.rb_feeds set last_requested=now() where token=p_token;
    return found;
  else raise exception 'Unknown feed action';
  end if;
  return true;
end $$;

create function public.rb_visit(p_id uuid,p_visitor uuid,p_page text,p_post uuid,p_seconds integer,p_depth integer,p_source text,p_click uuid,p_destination text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_page not in ('home','archive','article') or (p_page='article') <> (p_post is not null)
    or p_seconds not between 0 and 14400 or p_depth not between 0 and 100
    or length(p_source)>253 or (p_click is null) <> (p_destination is null)
    or (p_click is not null and (p_post is null or length(p_destination)>2048 or p_destination !~ '^(https?://|mailto:)'))
    then raise exception 'Invalid measurement'; end if;
  if p_post is not null and not exists(select 1 from public.rb_posts where id=p_post) then return; end if;
  insert into public.rb_visits as v(id,visitor,page,post_id,seconds,depth,source)
    values(p_id,p_visitor,p_page,p_post,p_seconds,p_depth,p_source)
    on conflict(id) do update set seconds=greatest(v.seconds,excluded.seconds),depth=greatest(v.depth,excluded.depth)
    where v.visitor=excluded.visitor and v.page=excluded.page and v.post_id is not distinct from excluded.post_id;
  if found and p_click is not null then
    insert into public.rb_link_clicks values(p_click,p_id,p_destination) on conflict do nothing;
  end if;
end $$;

create function public.rb_readership(p_days integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report jsonb;
begin
  if not public.rb_is_owner() then raise exception 'Owner access required'; end if;
  if p_days not in (7,30,90) or p_days is null then raise exception 'Invalid period'; end if;
  with visits as (select * from public.rb_visits where started >= (((now() at time zone 'UTC')::date - (p_days-1))::timestamp at time zone 'UTC')),
  daily as (
    select (now() at time zone 'UTC')::date - n as day from generate_series(0,p_days-1) n
  ), traffic as (
    select day,count(v.id) as views,count(distinct v.visitor) as visitors
    from daily left join visits v on (v.started at time zone 'UTC')::date=day group by day
  ), articles as (
    select d.title,count(*) as views,count(distinct visitor) as readers,round(avg(seconds)) as seconds,
      count(*) filter(where depth>=90 and seconds>=30) as reads
    from visits v join public.rb_drafts d on v.post_id=d.id group by d.id
  ), links as (
    select d.title,c.destination,count(*) as clicks from public.rb_link_clicks c
    join visits v on v.id=c.visit join public.rb_drafts d on d.id=v.post_id group by d.id,c.destination
  ), sources as (select source,count(*) as views from visits group by source)
  select jsonb_build_object(
    'views',(select count(*) from visits),'visitors',(select count(distinct visitor) from visits),
    'traffic',(select jsonb_agg(t order by day) from traffic t),
    'subscriptions',(select count(*) from public.rb_feeds where last_requested is not null),
    'followers',(select count(*) from public.rb_feeds where last_requested >= now()-interval '30 days'),
    'articles',coalesce((select jsonb_agg(a order by reads desc,views desc,title) from articles a),'[]'),
    'sources',coalesce((select jsonb_agg(s order by views desc,source) from (select * from sources order by views desc,source limit 30) s),'[]'),
    'links',coalesce((select jsonb_agg(l order by clicks desc,title,destination) from (select * from links order by clicks desc,title,destination limit 100) l),'[]')
  ) into report;
  return report;
end $$;
revoke all on function public.rb_readership(integer) from public,anon,authenticated;
grant execute on function public.rb_readership(integer) to authenticated;
revoke all on function public.rb_feed(uuid,text), public.rb_visit(uuid,uuid,text,uuid,integer,integer,text,uuid,text) from public;
grant execute on function public.rb_feed(uuid,text), public.rb_visit(uuid,uuid,text,uuid,integer,integer,text,uuid,text) to anon,authenticated;
commit;
