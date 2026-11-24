begin;

-- The writing archive is The Afterthoughts. A post outside that topic has a null topic.
alter table public.rb_posts
  add column email_topic text default 'afterthoughts' check (email_topic = 'afterthoughts');
alter table public.rb_email_subscriptions
  add column topic text not null default 'afterthoughts' check (topic = 'afterthoughts');

create or replace function public.rb_queue_article_emails() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.rb_email_publications values(new.id,new.title,new.slug) on conflict do nothing;
  if found and new.email_topic is not null then
    insert into public.rb_article_emails(post_id,subscriber_id)
      select new.id,s.id from public.rb_email_subscriptions s
      where s.topic=new.email_topic and s.confirmed_at<=new.published_at;
  end if;
  return new;
end $$;

commit;
