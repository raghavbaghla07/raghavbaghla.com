begin;

create function public.rb_delete_article(p_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rb_is_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  -- Serialize with save, publish, and unpublish for this article.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  delete from public.rb_posts where id = p_id;
  delete from public.rb_drafts where id = p_id and revision = p_expected_revision;
  if not found then
    -- The exception rolls back the public deletion too.
    raise exception 'Revision conflict: reload the saved draft';
  end if;
end $$;

revoke all on function public.rb_delete_article(uuid, integer) from public, anon, authenticated;
grant execute on function public.rb_delete_article(uuid, integer) to authenticated;

commit;
