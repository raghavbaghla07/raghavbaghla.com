begin;
-- Preserve the original all-link report alongside the outbound-only ranking.
create function public.rb_analytics_article_links(p_start date,p_end date)
returns table(article text,destination text,link_number integer,clicks bigint)
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
begin
  perform public.rb_analytics_bounds(p_start,p_end);
  return query select d.title,c.destination,c.link_number,count(*) from public.rb_visits v
    join public.rb_link_clicks c on c.visit=v.id join public.rb_drafts d on d.id=v.post_id
    where v.started>=p_start and v.started<p_end+1 group by d.id,c.destination,c.link_number
    order by count(*) desc,d.title,c.destination,c.link_number,d.id limit 100;
end $$;
revoke all on function public.rb_analytics_article_links(date,date) from public,anon,authenticated;
grant execute on function public.rb_analytics_article_links(date,date) to authenticated;
commit;
