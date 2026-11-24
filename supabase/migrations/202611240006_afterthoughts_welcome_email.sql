begin;

alter table public.rb_email_subscriptions
  add column welcome_pending boolean not null default false;

create function public.rb_mark_welcome_pending() returns trigger
language plpgsql set search_path='' as $$
begin
  new.welcome_pending := true;
  return new;
end $$;

create trigger rb_mark_welcome_pending before update of confirmed_at on public.rb_email_subscriptions
  for each row when (old.confirmed_at is null and new.confirmed_at is not null)
  execute function public.rb_mark_welcome_pending();

create function public.rb_follow_afterthoughts_with_welcome(p_email text,p_sender text,p_visit uuid,p_visitor uuid)
returns table(active boolean,welcome_token uuid)
language plpgsql security definer set search_path='' as $$
begin
  active := public.rb_follow_afterthoughts(p_email,p_sender,p_visit,p_visitor);
  if active then
    select s.unsubscribe into welcome_token
    from public.rb_email_subscriptions s
    where s.email=p_email and s.welcome_pending and s.confirmed_at > now() - interval '23 hours';
  end if;
  return next;
end $$;

create function public.rb_record_welcome_sent(p_token uuid) returns void
language sql security definer set search_path='' as $$
  update public.rb_email_subscriptions set welcome_pending=false where unsubscribe=p_token and welcome_pending;
$$;

revoke all on function public.rb_mark_welcome_pending(),
  public.rb_follow_afterthoughts_with_welcome(text,text,uuid,uuid),public.rb_record_welcome_sent(uuid)
  from public,anon,authenticated;
grant execute on function public.rb_follow_afterthoughts_with_welcome(text,text,uuid,uuid),
  public.rb_record_welcome_sent(uuid) to service_role;
commit;
