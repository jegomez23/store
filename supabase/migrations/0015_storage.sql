-- Supabase Storage: buckets `products` y `content`, lectura pública,
-- escritura solo admin (docs/03-DATABASE.md §4, docs/08-SECURITY.md §6).

insert into storage.buckets (id, name, public)
values
  ('products', 'products', true),
  ('content', 'content', true)
on conflict (id) do nothing;

create policy "public_read_products_bucket" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'products');

create policy "admin_write_products_bucket" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());

create policy "admin_update_products_bucket" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());

create policy "admin_delete_products_bucket" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and public.is_admin());

create policy "public_read_content_bucket" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'content');

create policy "admin_write_content_bucket" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content' and public.is_admin());

create policy "admin_update_content_bucket" on storage.objects
  for update to authenticated
  using (bucket_id = 'content' and public.is_admin())
  with check (bucket_id = 'content' and public.is_admin());

create policy "admin_delete_content_bucket" on storage.objects
  for delete to authenticated
  using (bucket_id = 'content' and public.is_admin());
