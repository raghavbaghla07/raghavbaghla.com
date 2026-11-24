begin;

create function public.rb_follow_afterthoughts(p_email text,p_sender text,p_visit uuid,p_visitor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  requested timestamptz := clock_timestamp();
  request_count integer;
  attributed_visit uuid;
begin
  delete from public.rb_email_signup_limits where window_start < requested - interval '1 day';
  delete from public.rb_email_subscriptions where confirmed_at is null and requested_at < requested - interval '2 days';
  insert into public.rb_email_signup_limits as limits values(p_sender,requested,1)
    on conflict(sender) do update set
      requests=case when limits.window_start < requested - interval '1 hour' then 1 else limits.requests+1 end,
      window_start=case when limits.window_start < requested - interval '1 hour' then requested else limits.window_start end
    returning requests into request_count;
  if request_count > 8 then return false; end if;

  insert into public.rb_email_subscriptions(email,requested_at)
    values(p_email,requested) on conflict(email) do nothing;
  perform 1 from public.rb_email_subscriptions where email=p_email and confirmed_at is null for update;
  if not found then return true; end if;

  update public.rb_visits set signed_up=true
    where id=p_visit and visitor=p_visitor and post_id is not null and started >= requested - interval '1 day'
    returning id into attributed_visit;
  -- Updating the activation timestamp also records the existing analytics event.
  update public.rb_email_subscriptions
    set confirmed_at=requested,requested_at=requested,confirmation=null,origin_visit=attributed_visit
    where email=p_email;
  return true;
end $$;

revoke all on function public.rb_follow_afterthoughts(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rb_follow_afterthoughts(text,text,uuid,uuid) to service_role;
commit;
