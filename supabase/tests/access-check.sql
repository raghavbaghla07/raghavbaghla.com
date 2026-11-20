-- Run in the Supabase SQL editor as the database administrator after migration.
-- Everything rolls back. UUIDs below are temporary fixtures, not owner provisioning.
begin;
insert into public.rb_studio_owners(user_id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$ begin
  if public.rb_is_owner() then raise exception 'FAIL nonowner escalation'; end if;
  if exists(select 1 from public.rb_drafts) then raise exception 'FAIL draft leak'; end if;
  begin
    perform public.rb_save_draft('33333333-3333-4333-8333-333333333333','Private','Private','[]',0);
    raise exception 'FAIL nonowner saved';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.rb_studio_owners values ('22222222-2222-4222-8222-222222222222');
    raise exception 'FAIL membership writable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.rb_save_draft('33333333-3333-4333-8333-333333333333','Access test','Published snapshot','[]',0);
select public.rb_publish_draft('33333333-3333-4333-8333-333333333333',1);
select public.rb_save_draft('33333333-3333-4333-8333-333333333333','Access test','Unpublished changes','[]',1);
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
  if exists(select 1 from public.rb_drafts) then raise exception 'FAIL anonymous draft leak'; end if;
  if not exists(select 1 from public.rb_posts where id='33333333-3333-4333-8333-333333333333' and body='Published snapshot') then
    raise exception 'FAIL snapshot isolation'; end if;
  begin
    perform public.rb_unpublish_post('33333333-3333-4333-8333-333333333333');
    raise exception 'FAIL anonymous unpublish';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
