begin;

create table public.rb_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  confirmation uuid unique,
  requested_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  unsubscribe uuid not null unique default gen_random_uuid()
);
create table public.rb_email_signup_limits (
  sender text primary key,
  window_start timestamptz not null,
  requests integer not null
);
create table public.rb_email_publications (
  post_id uuid primary key references public.rb_drafts on delete cascade,
  title text not null,
  slug text not null
);
-- Existing public articles are never sent when the feature is enabled.
insert into public.rb_email_publications (post_id,title,slug)
  select id,title,slug from public.rb_posts;

create table public.rb_article_emails (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.rb_email_publications on delete cascade,
  subscriber_id uuid not null references public.rb_email_subscriptions on delete cascade,
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz
);
create index rb_article_emails_ready on public.rb_article_emails(available_at,id) where sent_at is null and attempts < 7;
create index rb_article_emails_subscriber on public.rb_article_emails(subscriber_id);
create index rb_article_emails_post on public.rb_article_emails(post_id);

alter table public.rb_email_subscriptions enable row level security;
alter table public.rb_email_signup_limits enable row level security;
alter table public.rb_email_publications enable row level security;
alter table public.rb_article_emails enable row level security;
revoke all on public.rb_email_subscriptions,public.rb_email_signup_limits,public.rb_email_publications,public.rb_article_emails
  from public,anon,authenticated;
grant update,select on public.rb_article_emails to service_role;

create function public.rb_request_email_subscription(p_email text,p_sender text) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid; current_time_value timestamptz := clock_timestamp(); request_count integer;
begin
  delete from public.rb_email_signup_limits where window_start < current_time_value - interval '1 day';
  delete from public.rb_email_subscriptions where confirmed_at is null and requested_at < current_time_value - interval '2 days';
  insert into public.rb_email_signup_limits as limits values(p_sender,current_time_value,1)
    on conflict(sender) do update set
      requests=case when limits.window_start < current_time_value - interval '1 hour' then 1 else limits.requests+1 end,
      window_start=case when limits.window_start < current_time_value - interval '1 hour' then current_time_value else limits.window_start end
    returning requests into request_count;
  if request_count > 8 then return null; end if;
  insert into public.rb_email_subscriptions as s (email,confirmation)
    values(p_email,gen_random_uuid())
    on conflict(email) do update set confirmation=excluded.confirmation,requested_at=current_time_value
    where s.confirmed_at is null and s.requested_at < current_time_value - interval '10 minutes'
    returning confirmation into token;
  return token;
end $$;

create function public.rb_confirm_email_subscription(p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.rb_email_subscriptions set confirmed_at=clock_timestamp()
    where confirmation=p_token and confirmed_at is null and requested_at >= now() - interval '1 day';
  if found then return true; end if;
  return exists(select 1 from public.rb_email_subscriptions where confirmation=p_token and confirmed_at is not null);
end $$;

create function public.rb_queue_article_emails() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.rb_email_publications values(new.id,new.title,new.slug) on conflict do nothing;
  if found then
    insert into public.rb_article_emails(post_id,subscriber_id)
      select new.id,id from public.rb_email_subscriptions where confirmed_at <= new.published_at;
  end if;
  return new;
end $$;
create trigger rb_queue_article_emails after insert on public.rb_posts
  for each row execute function public.rb_queue_article_emails();

-- Cancel pending deliveries when an article is unpublished.
create function public.rb_cancel_article_emails() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.rb_article_emails where post_id=old.id and sent_at is null;
  return old;
end $$;
create trigger rb_cancel_article_emails after delete on public.rb_posts
  for each row execute function public.rb_cancel_article_emails();

create function public.rb_claim_article_email() returns table(id uuid,email text,unsubscribe uuid,title text,slug text)
language sql security definer set search_path='' as $$
  with candidate as (
    select q.id from public.rb_article_emails q
    where q.sent_at is null and q.available_at <= now() and q.attempts < 7
    order by q.available_at,q.id limit 1 for update skip locked
  ), claimed as (
    update public.rb_article_emails q set available_at=now()+interval '15 minutes',attempts=q.attempts+1
    from candidate where q.id=candidate.id returning q.*
  )
  select q.id,s.email,s.unsubscribe,p.title,p.slug from claimed q
  join public.rb_email_subscriptions s on s.id=q.subscriber_id
  join public.rb_email_publications p on p.post_id=q.post_id;
$$;

create or replace function public.rb_readership(p_days integer) returns jsonb
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
    'email_subscribers',(select count(*) from public.rb_email_subscriptions where confirmed_at is not null),
    'articles',coalesce((select jsonb_agg(a order by reads desc,views desc,title) from articles a),'[]'),
    'sources',coalesce((select jsonb_agg(s order by views desc,source) from (select * from sources order by views desc,source limit 30) s),'[]'),
    'links',coalesce((select jsonb_agg(l order by clicks desc,title,destination) from (select * from links order by clicks desc,title,destination limit 100) l),'[]')
  ) into report;
  return report;
end $$;
create function public.rb_unsubscribe_email(p_token uuid) returns void
language sql security definer set search_path='' as $$
  delete from public.rb_email_subscriptions where unsubscribe=p_token;
$$;

revoke all on function public.rb_request_email_subscription(text,text),public.rb_confirm_email_subscription(uuid),
  public.rb_claim_article_email(),public.rb_queue_article_emails(),public.rb_cancel_article_emails(),
  public.rb_unsubscribe_email(uuid) from public,anon,authenticated;
grant execute on function public.rb_request_email_subscription(text,text),public.rb_confirm_email_subscription(uuid),
  public.rb_claim_article_email(),public.rb_unsubscribe_email(uuid) to service_role;

-- Retire address creation and tracking while preserving old data for rollback.
revoke all on function public.rb_feed(uuid,text) from anon,authenticated;
commit;
