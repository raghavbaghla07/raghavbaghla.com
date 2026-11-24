begin;

alter table public.rb_visits
  add column last_active timestamptz,
  add column measured boolean not null default false,
  add column country text,
  add column device text,
  add column browser text,
  add column campaign text,
  add column medium text,
  add column signed_up boolean not null default false,
  add column converted boolean not null default false;
alter table public.rb_link_clicks add column link_number integer;
alter table public.rb_email_subscriptions add column origin_visit uuid references public.rb_visits on delete set null;

create index rb_visits_browser_history on public.rb_visits(visitor, started);
create index rb_visits_recent on public.rb_visits(last_active, visitor) where last_active is not null;
create index rb_comments_created on public.rb_comments(created_at, post_id);
create index rb_comments_pending on public.rb_comments(post_id) where status='pending';
create index rb_subscriptions_origin on public.rb_email_subscriptions(origin_visit) where origin_visit is not null;
create index rb_emails_waiting on public.rb_article_emails(attempts) where sent_at is null;

-- Retain anonymous daily counts when a reader unlikes or unsubscribes.
create table public.rb_analytics_daily (
  day date not null,
  metric text not null check (metric in ('likes','confirmations','sent')),
  post_id uuid,
  amount bigint not null,
  unique nulls not distinct(day,metric,post_id)
);
-- Keep event totals independent of later article removal.
create table public.rb_analytics_coverage (
  singleton boolean primary key default true check(singleton),
  since timestamptz not null default now()
);
insert into public.rb_analytics_coverage default values;
alter table public.rb_analytics_daily enable row level security;
alter table public.rb_analytics_coverage enable row level security;
revoke all on public.rb_analytics_daily, public.rb_analytics_coverage from public,anon,authenticated;

insert into public.rb_analytics_daily
select (created_at at time zone 'UTC')::date,'likes',post_id,count(*) from public.rb_post_likes group by 1,3
union all select (confirmed_at at time zone 'UTC')::date,'confirmations',null,count(*)
  from public.rb_email_subscriptions where confirmed_at is not null group by 1
union all select (sent_at at time zone 'UTC')::date,'sent',post_id,count(*)
  from public.rb_article_emails where sent_at is not null group by 1,3;

create function public.rb_count_analytics_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare article uuid; happened timestamptz;
begin
  case tg_argv[0]
    when 'likes' then article:=new.post_id; happened:=new.created_at;
    when 'sent' then article:=new.post_id; happened:=new.sent_at;
    when 'confirmations' then
      happened:=new.confirmed_at;
      update public.rb_visits set converted=true
        where id=new.origin_visit and signed_up returning post_id into article;
      new.origin_visit:=null;
  end case;
  insert into public.rb_analytics_daily as d values ((happened at time zone 'UTC')::date,tg_argv[0],article,1)
    on conflict(day,metric,post_id) do update set amount=d.amount+1;
  return new;
end $$;
create trigger rb_count_like after insert on public.rb_post_likes
  for each row execute function public.rb_count_analytics_event('likes');
create trigger rb_count_sent after update of sent_at on public.rb_article_emails
  for each row when(old.sent_at is null and new.sent_at is not null)
  execute function public.rb_count_analytics_event('sent');
create trigger rb_count_confirmation before update of confirmed_at on public.rb_email_subscriptions
  for each row when(old.confirmed_at is null and new.confirmed_at is not null)
  execute function public.rb_count_analytics_event('confirmations');

-- Store only DNS hosts. Reject literal IPs, addresses, URL credentials and local names.
create function public.rb_analytics_host(value text) returns text
language sql immutable set search_path='' as $$
  select case when length(value)<=253 and lower(value) ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    then lower(value) end
$$;
create function public.rb_analytics_destination(value text) returns text
language sql immutable set search_path='' as $$
  select case when value like 'mailto:%' then 'mailto:'
    else coalesce('https://'||public.rb_analytics_host(substring(value from '^https?://([^/?#:]+)(?:[:/?#]|$)')),'Other link') end
$$;
create function public.rb_clean_measurement() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='rb_visits' then
    new.source:=case when new.source='Direct' then 'Direct' else coalesce(public.rb_analytics_host(new.source),'Unknown') end;
  else new.destination:=public.rb_analytics_destination(new.destination);
  end if;
  return new;
end $$;
update public.rb_visits set source=coalesce(public.rb_analytics_host(source),'Unknown') where source<>'Direct';
update public.rb_link_clicks set destination=public.rb_analytics_destination(destination);
create trigger rb_clean_source before insert or update of source on public.rb_visits
  for each row execute function public.rb_clean_measurement();
create trigger rb_clean_link before insert or update of destination on public.rb_link_clicks
  for each row execute function public.rb_clean_measurement();

-- Only the same-origin server supplies coarse request metadata to this entry point.
create function public.rb_measure(p_id uuid,p_visitor uuid,p_page text,p_post uuid,p_seconds integer,p_depth integer,
  p_source text,p_click uuid,p_destination text,p_link integer,p_country text,p_device text,p_browser text,
  p_campaign text,p_medium text,p_active boolean,p_signup boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_country !~ '^[A-Z]{2}$' or p_device not in ('Desktop','Mobile','Tablet')
    or p_browser not in ('Chrome','Edge','Safari','Firefox','Samsung Internet','Other')
    or p_campaign !~ '^[a-z][a-z0-9_-]{0,47}$' or p_medium not in ('newsletter','search','social','other')
    or p_link not between 1 and 10000 then raise exception 'Invalid measurement labels'; end if;
  perform public.rb_visit(p_id,p_visitor,p_page,p_post,p_seconds,p_depth,p_source,p_click,p_destination);
  update public.rb_visits v set measured=true,
    last_active=case when p_active then clock_timestamp() else last_active end,
    country=coalesce(country,p_country),device=coalesce(device,p_device),browser=coalesce(browser,p_browser),
    campaign=coalesce(campaign,p_campaign), medium=coalesce(medium,p_medium),
    signed_up=signed_up or (coalesce(p_signup,false) and p_post is not null)
    where id=p_id and visitor=p_visitor and page=p_page and post_id is not distinct from p_post;
  if found and p_click is not null then
    update public.rb_link_clicks set link_number=p_link where id=p_click and visit=p_id and link_number is null;
  end if;
end $$;

create function public.rb_request_attributed_email(p_email text,p_sender text,p_visit uuid,p_visitor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
  token:=public.rb_request_email_subscription(p_email,p_sender);
  if token is not null then
    update public.rb_visits set signed_up=true where id=p_visit and visitor=p_visitor and post_id is not null
      and started >= now()-interval '1 day';
    if found then update public.rb_email_subscriptions set origin_visit=p_visit where confirmation=token;
    else update public.rb_email_subscriptions set origin_visit=null where confirmation=token; end if;
  end if;
  return token;
end $$;

create function public.rb_confirm_private_email(p_token uuid,p_skip_attribution boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_skip_attribution then update public.rb_email_subscriptions set origin_visit=null where confirmation=p_token; end if;
  return public.rb_confirm_email_subscription(p_token);
end $$;

create function public.rb_analytics_bounds(p_start date,p_end date) returns void
language plpgsql stable set search_path='' as $$
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_start < date '2000-01-01' or p_end > (now() at time zone 'UTC')::date
    or p_end<p_start or p_end-p_start>=365 then raise exception 'Choose 1 to 365 UTC days'; end if;
end $$;

create function public.rb_channel(host text,medium text) returns text
language sql immutable set search_path='' as $$
  select case when medium='newsletter' then 'Newsletter' when medium='search' then 'Search'
    when medium='social' then 'Social' when medium='other' then 'Other'
    when host='Direct' then 'Direct'
    when host='mail.google.com' then 'Newsletter'
    when host ~ '(^|\.)(google\.[a-z.]{2,7}|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|brave\.com)$' then 'Search'
    when host ~ '(^|\.)(instagram\.com|facebook\.com|linkedin\.com|lnkd\.in|t\.co|x\.com|twitter\.com|reddit\.com|threads\.net|t\.me|youtube\.com|bsky\.app)$' then 'Social'
    when host ~ '(^|\.)(mail\.google\.com|outlook\.live\.com|mail\.yahoo\.com|substack\.com|beehiiv\.com)$' then 'Newsletter'
    else 'Other' end
$$;

create function public.rb_live_browsers() returns bigint language plpgsql stable security definer set search_path='' as $$
begin
  if not public.rb_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
  return (select count(distinct visitor) from public.rb_visits where last_active>=now()-interval '5 minutes');
end $$;

create function public.rb_analytics_report(p_start date,p_end date,p_bucket text) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare result jsonb; previous_start date;
begin
  perform public.rb_analytics_bounds(p_start,p_end);
  if p_bucket is null or p_bucket not in ('day','week','month') then raise exception 'Invalid interval'; end if;
  previous_start:=p_start-(p_end-p_start+1);
  with periods as (
    select 'current' as name,p_start as first,p_end+1 as stop union all select 'previous',previous_start,p_start
  ), visits as (
    select * from public.rb_visits where started>=p_start and started<p_end+1
  ), metrics as (
    select name,jsonb_build_object('views',count(v.id),'uniques',count(distinct visitor),'average',round(avg(seconds)),
      'rate',round(100.0*count(*) filter(where post_id is not null and depth>=90 and seconds>=30)/nullif(count(post_id),0),2),
      'likes',(select coalesce(sum(amount),0) from public.rb_analytics_daily where metric='likes' and day>=first and day<stop),
      'subscribers',(select coalesce(sum(amount),0) from public.rb_analytics_daily where metric='confirmations' and day>=first and day<stop),
      'comments',(select count(*) from public.rb_comments where created_at>=first and created_at<stop)) as values
    from periods left join public.rb_visits v on started>=first and started<stop group by name,first,stop
  ), buckets as (
    select day::date from generate_series(date_trunc(p_bucket,p_start::timestamp),p_end::timestamp,('1 '||p_bucket)::interval) day
  ), traffic as (
    select date_trunc(p_bucket,started)::date as day,count(*) views,count(distinct visitor) uniques from visits group by 1
  ), engagement as (
    select date_trunc(p_bucket,day::timestamp)::date as day,sum(amount) likes from public.rb_analytics_daily
    where metric='likes' and day between p_start and p_end group by 1
  ), comments as (
    select date_trunc(p_bucket,created_at)::date as day,count(*) comments from public.rb_comments
    where created_at>=p_start and created_at<p_end+1 group by 1
  ), trend as (
    select b.day,coalesce(views,0) views,coalesce(uniques,0) uniques,coalesce(likes,0) likes,coalesce(comments,0) comments
    from buckets b left join traffic using(day) left join engagement using(day) left join comments using(day)
  ), audience as (
    select distinct visitor from visits
  ), returning_count as (
    select count(*) filter(where exists(select 1 from public.rb_visits h where h.visitor=a.visitor and h.started<p_start)) as prior,
      count(*) total from audience a
  ), dimensions as (
    select dimension,label,count(*) as views from visits cross join lateral (values
      ('countries',coalesce(country,'Unknown')),('devices',coalesce(device,'Unknown')),('browsers',coalesce(browser,'Unknown')),
      ('channels',public.rb_channel(source,medium)),('hosts',source),('campaigns',campaign)
    ) as labels(dimension,label) where label is not null group by dimension,label
  ), ranked as (
    select *,row_number() over(partition by dimension order by views desc,label) rank from dimensions
  ), breakdowns as (
    select dimension,jsonb_agg(jsonb_build_object('label',label,'value',views) order by rank) as rows
    from ranked where rank<=case dimension when 'countries' then 250 else 50 end group by dimension
  ), pages as (
    select v.page,v.post_id,coalesce(d.title,case v.page when 'home' then 'Homepage' else 'Writing archive' end) label,
      sum(seconds) total,round(avg(seconds)) average from visits v left join public.rb_drafts d on d.id=v.post_id
    group by v.page,v.post_id,d.title
  ), links as (
    select d.title as article,c.destination,c.link_number,count(*) clicks from visits v join public.rb_link_clicks c on c.visit=v.id
    join public.rb_drafts d on d.id=v.post_id
    where c.destination not in ('https://raghavbaghla.com','https://www.raghavbaghla.com')
    group by d.id,c.destination,c.link_number order by clicks desc,article,c.destination,c.link_number,d.id limit 100
  ), pending as (
    select c.post_id,count(*) amount from public.rb_comments c join public.rb_posts p on p.id=c.post_id
    where c.status='pending' group by c.post_id
  )
  select jsonb_build_object(
    'metrics',(select jsonb_object_agg(name,values) from metrics),
    'trend',(select jsonb_agg(t order by day) from trend t),
    'breakdowns',coalesce((select jsonb_object_agg(dimension,rows) from breakdowns),'{}'),
    'audience',(select jsonb_build_object('new',total-prior,'returning',prior) from returning_count),
    'time_total',coalesce((select jsonb_agg(t order by total desc,label,post_id) from
      (select * from pages order by total desc,label,post_id limit 12) t),'[]'),
    'time_average',coalesce((select jsonb_agg(t order by average desc,label,post_id) from
      (select * from pages order by average desc,label,post_id limit 12) t),'[]'),
    'depth',(select jsonb_agg(jsonb_build_object('level',level,'reached',reached) order by level) from
      (select level,(select count(*) from visits where post_id is not null and depth>=level) reached
       from unnest(array[25,50,75,90,100]) level) t),
    'links',coalesce((select jsonb_agg(l order by clicks desc,article,destination,link_number) from links l),'[]'),
    'pending',jsonb_build_object('count',(select coalesce(sum(amount),0) from pending),
      'post',(select post_id from pending order by amount desc,post_id limit 1)),
    'funnel',(select jsonb_build_object('views',count(post_id),'eligible',count(post_id) filter(where measured),
      'signups',count(*) filter(where signed_up),'confirmed',count(*) filter(where converted)) from visits),
    'newsletter',jsonb_build_object('total',(select count(*) from public.rb_email_subscriptions where confirmed_at is not null),
      'accepted',(select coalesce(sum(amount),0) from public.rb_analytics_daily where metric='sent' and day between p_start and p_end),
      'queued',(select count(*) from public.rb_article_emails where sent_at is null and attempts<7),
      'exhausted',(select count(*) from public.rb_article_emails where sent_at is null and attempts>=7)),
    'since',(select since::date from public.rb_analytics_coverage)
  ) into result;
  return result;
end $$;

create function public.rb_analytics_content(p_start date,p_end date,p_search text,p_sort text,p_desc boolean,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare result jsonb;
begin
  perform public.rb_analytics_bounds(p_start,p_end);
  if p_search is null or length(p_search)>160 or p_sort is null or p_desc is null or p_sort not in
    ('title','views','uniques','average','d25','d50','d75','d90','d100','rate','likes','comments','subscribers')
    or p_offset is null or p_offset not between 0 and 1000000 then raise exception 'Invalid article filters'; end if;
  with visits as (
    select post_id,count(*) views,count(distinct visitor) uniques,round(avg(seconds)) average,
      round(100.0*count(*) filter(where depth>=90 and seconds>=30)/count(*),1) rate,
      round(100.0*count(*) filter(where depth>=25)/count(*),1) d25,
      round(100.0*count(*) filter(where depth>=50)/count(*),1) d50,
      round(100.0*count(*) filter(where depth>=75)/count(*),1) d75,
      round(100.0*count(*) filter(where depth>=90)/count(*),1) d90,
      round(100.0*count(*) filter(where depth>=100)/count(*),1) d100
    from public.rb_visits where started>=p_start and started<p_end+1 and post_id is not null group by post_id
  ), events as (
    select post_id,sum(amount) filter(where metric='likes') likes,sum(amount) filter(where metric='confirmations') subscribers
    from public.rb_analytics_daily where day between p_start and p_end and post_id is not null group by post_id
  ), comments as (
    select post_id,count(*) comments from public.rb_comments where created_at>=p_start and created_at<p_end+1 group by post_id
  ), articles as (
    select d.id,d.title,coalesce(v.views,0) views,coalesce(v.uniques,0) uniques,v.average,v.rate,v.d25,v.d50,v.d75,v.d90,v.d100,
      coalesce(e.likes,0) likes,coalesce(c.comments,0) comments,coalesce(e.subscribers,0) subscribers
    from public.rb_drafts d left join visits v on v.post_id=d.id left join events e on e.post_id=d.id
    left join comments c on c.post_id=d.id left join public.rb_posts p on p.id=d.id
    where (p.id is not null or v.post_id is not null or e.post_id is not null or c.post_id is not null)
      and strpos(lower(d.title),lower(p_search))>0
  ), ordered as (
    select a.*,row_number() over(order by
      case when p_sort='title' and p_desc then lower(title) end desc,
      case when p_sort='title' and not p_desc then lower(title) end,
      case when p_sort<>'title' and p_desc then (to_jsonb(a)->>p_sort)::numeric end desc nulls last,
      case when p_sort<>'title' and not p_desc then (to_jsonb(a)->>p_sort)::numeric end asc nulls last,id) as position
    from articles a
  )
  select jsonb_build_object('total',(select count(*) from articles),'rows',
    coalesce((select jsonb_agg(to_jsonb(o)-'position' order by position) from ordered o
      where position>p_offset and position<=p_offset+50),'[]')) into result;
  return result;
end $$;

-- Legacy read API keeps its original shape, with a bounded article list.
create or replace function public.rb_readership(p_days integer) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare r jsonb; today date:=current_date; first date;
begin
  if p_days is null or p_days not in (7,30,90) then raise exception 'Invalid period'; end if;
  first:=today-(p_days-1);
  r:=public.rb_analytics_report(first,today,'day');
  return jsonb_build_object('views',r#>'{metrics,current,views}','visitors',r#>'{metrics,current,uniques}',
    'email_subscribers',r#>'{newsletter,total}',
    'traffic',(select jsonb_agg(jsonb_build_object('day',t->'day','views',t->'views','visitors',t->'uniques') order by t->>'day') from jsonb_array_elements(r->'trend') t),
    'articles',coalesce((select jsonb_agg(a order by reads desc,views desc,title) from (
      select d.title,count(*) views,count(distinct visitor) readers,round(avg(seconds)) seconds,
        count(*) filter(where depth>=90 and seconds>=30) reads from public.rb_visits v join public.rb_drafts d on d.id=v.post_id
      where started>=first and started<today+1 group by d.id order by reads desc,views desc,d.title limit 100) a),'[]'),
    'links',coalesce((select jsonb_agg(l order by clicks desc,title,destination) from (
      select d.title,c.destination,count(*) clicks from public.rb_link_clicks c join public.rb_visits v on v.id=c.visit
      join public.rb_drafts d on d.id=v.post_id where started>=first and started<today+1
      group by d.id,c.destination order by clicks desc,d.title,c.destination limit 100) l),'[]'),
    'sources',coalesce((select jsonb_agg(jsonb_build_object('source',s->'label','views',s->'value') order by (s->>'value')::bigint desc,s->>'label')
      from jsonb_array_elements(r#>'{breakdowns,hosts}') s),'[]'));
end $$;

revoke all on function public.rb_count_analytics_event(),public.rb_clean_measurement(),public.rb_analytics_bounds(date,date),
  public.rb_analytics_host(text),public.rb_analytics_destination(text),public.rb_channel(text,text),
  public.rb_measure(uuid,uuid,text,uuid,integer,integer,text,uuid,text,integer,text,text,text,text,text,boolean,boolean),
  public.rb_request_attributed_email(text,text,uuid,uuid),public.rb_confirm_private_email(uuid,boolean),
  public.rb_analytics_report(date,date,text),public.rb_analytics_content(date,date,text,text,boolean,integer),public.rb_live_browsers()
  from public,anon,authenticated;
grant execute on function public.rb_measure(uuid,uuid,text,uuid,integer,integer,text,uuid,text,integer,text,text,text,text,text,boolean,boolean),
  public.rb_request_attributed_email(text,text,uuid,uuid),public.rb_confirm_private_email(uuid,boolean) to service_role;
grant execute on function public.rb_analytics_report(date,date,text),public.rb_analytics_content(date,date,text,text,boolean,integer),
  public.rb_live_browsers() to authenticated;
commit;
