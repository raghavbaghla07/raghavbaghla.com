-- Public portfolio assets; only the owner can upload. No paid storage subscription.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media', 'portfolio-media', true, 20971520, array[
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

create policy "owner_uploads_portfolio_media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'portfolio-media' and public.is_admin()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "owner_reads_media_records" on storage.objects
for select to authenticated using (
  bucket_id = 'portfolio-media' and public.is_admin()
);
create policy "owner_deletes_portfolio_media" on storage.objects
for delete to authenticated using (
  bucket_id = 'portfolio-media' and public.is_admin()
);
