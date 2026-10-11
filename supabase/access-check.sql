-- Run after both migrations. All test records are rolled back.
begin;
insert into public.posts(slug,title,excerpt,category,color,published) values
('qa-private-check','Private check','Temporary private check','Notes','peach',false),
('qa-public-check','Public check','Temporary public check','Notes','lime',true);
set local role anon;
select
 (select count(*) from public.posts where slug = 'qa-private-check') = 0 as drafts_private,
 (select count(*) from public.posts where slug = 'qa-public-check') = 1 as published_readable,
 not public.is_admin() as visitor_not_admin,
 not has_table_privilege('anon','public.posts','INSERT') as publishing_blocked,
 not has_function_privilege('anon','public.guest_action(uuid,uuid,text,text,text,text)','EXECUTE') as direct_guest_rpc_blocked;
rollback;
