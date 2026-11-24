-- Run after the analytics migration. Test data and role changes roll back.
begin;
set local timezone='UTC';
insert into public.rb_studio_owners values ('bf001122-1111-4111-8111-121212121212') on conflict do nothing;
set local role anon;
do $$ begin
  begin perform public.rb_analytics_report(current_date,current_date,'day'); raise exception 'Anonymous report exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.rb_live_browsers(); raise exception 'Anonymous live count exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.rb_analytics_content(current_date,current_date,'','title',true,0); raise exception 'Anonymous articles exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','bf001122-2222-4222-8222-121212121212',true);
do $$ begin
  begin perform public.rb_analytics_report(current_date,current_date,'day'); raise exception 'Nonowner report exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.rb_analytics_content(current_date,current_date,'','views',true,0); raise exception 'Nonowner articles exposed';
  exception when insufficient_privilege then null; end;
  begin perform public.rb_live_browsers(); raise exception 'Nonowner live count exposed';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.rb_analytics_daily; raise exception 'Raw rollup exposed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','bf001122-1111-4111-8111-121212121212',true);
do $$ declare r jsonb; begin
  r:=public.rb_analytics_report(current_date-6,current_date,'day');
  if jsonb_array_length(r->'trend')<>7 or (r#>>'{metrics,current,views}')::bigint <
    (r#>>'{metrics,current,uniques}')::bigint then raise exception 'Invalid weekly totals'; end if;
  perform public.rb_analytics_content(current_date,current_date,'','views',true,0);
  perform public.rb_live_browsers();
  begin perform 1 from public.rb_visits; raise exception 'Direct owner access exposed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
