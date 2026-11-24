-- Disposable PGlite fixture, loaded by supabase.ts --analytics.
begin;
set local timezone='UTC';
update public.rb_analytics_coverage set since=current_date-75;
insert into public.rb_drafts(id,title,body)
select md5('sample-post-'||n)::uuid,title,'An article in the local analytics fixture.'
from unnest(array['A notebook for small observations','What a second reading reveals','A walk before writing','The shape of a good question']) with ordinality as articles(title,n);
insert into public.rb_posts(id,slug,title,body)
select id,replace(lower(title),' ','-'),title,body from public.rb_drafts;
insert into public.rb_visits(id,visitor,page,post_id,started,seconds,depth,source,country,device,browser,campaign,medium,measured,signed_up,converted)
select md5('sample-visit-'||d||'-'||n)::uuid,md5('sample-browser-'||mod(d*7+n,65))::uuid,
  case when n%8=0 then 'home' when n%9=0 then 'archive' else 'article' end,
  case when n%8<>0 and n%9<>0 then md5('sample-post-'||(1+(n+d)%4))::uuid end,
  current_date-d+(n||' minutes')::interval,8+(d*3+n*13)%210,(d*17+n*21)%101,
  (array['Direct','www.google.com','linkedin.com','substack.com','raghavbaghla.com'])[1+n%5],
  (array['IN','GB','US','DE'])[1+n%4],(array['Desktop','Mobile','Tablet'])[1+n%3],
  (array['Chrome','Firefox','Safari'])[1+n%3],case when n%5=3 then 'afterthoughts' end,
  case when n%5=3 then 'newsletter' end,true,n%7=0 and n%8<>0 and n%9<>0,n%14=0 and n%8<>0 and n%9<>0
from generate_series(0,74) d cross join lateral generate_series(1,6+(74-d)/6+(d*7)%9) n;
update public.rb_visits set last_active=now() where started::date=current_date and seconds%3=0;
insert into public.rb_link_clicks(id,visit,destination,link_number)
select gen_random_uuid(),id,'https://example.org',1 from public.rb_visits where post_id is not null and depth>=90;
insert into public.rb_post_likes(post_id,visitor_id,created_at)
select post_id,gen_random_uuid(),started from public.rb_visits where post_id is not null and depth>=96;
insert into public.rb_comments(post_id,visitor_id,display_name,body,status,created_at)
select post_id,gen_random_uuid(),'Local reader','This made me revisit my notes.',
  case when started::date>=current_date-5 then 'pending' else 'approved' end,started
from public.rb_visits where post_id is not null and depth>=98;
-- Exercise the real confirmation and acceptance triggers.
insert into public.rb_email_subscriptions(email,origin_visit)
select id::text||'@example.invalid',id from public.rb_visits where converted;
update public.rb_email_subscriptions s set confirmed_at=v.started+interval '2 minutes'
from public.rb_visits v where v.id=s.origin_visit;
insert into public.rb_article_emails(post_id,subscriber_id)
select (select id from public.rb_drafts order by id limit 1),id from public.rb_email_subscriptions;
update public.rb_article_emails set sent_at=now(),attempts=1 where subscriber_id in
  (select id from public.rb_email_subscriptions order by id offset 3);
commit;
