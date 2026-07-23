-- Crack Chat Background v0.1 cloud sync
-- Lore Sync와 같은 Supabase 프로젝트의 SQL Editor에서 한 번만 실행함.

create table if not exists public.chat_background_sync (
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_key text not null check (char_length(room_key) between 1 and 500),
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision >= 1),
  device_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, room_key)
);

alter table public.chat_background_sync enable row level security;

drop policy if exists "chat background select own" on public.chat_background_sync;
create policy "chat background select own"
  on public.chat_background_sync for select
  using (auth.uid() = owner_id);

drop policy if exists "chat background insert own" on public.chat_background_sync;
create policy "chat background insert own"
  on public.chat_background_sync for insert
  with check (auth.uid() = owner_id);

drop policy if exists "chat background update own" on public.chat_background_sync;
create policy "chat background update own"
  on public.chat_background_sync for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "chat background delete own" on public.chat_background_sync;
create policy "chat background delete own"
  on public.chat_background_sync for delete
  using (auth.uid() = owner_id);

create or replace function public.set_chat_background_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_background_updated_at on public.chat_background_sync;
create trigger chat_background_updated_at
before update on public.chat_background_sync
for each row execute function public.set_chat_background_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-backgrounds',
  'chat-backgrounds',
  false,
  716800,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat background object select own" on storage.objects;
create policy "chat background object select own"
  on storage.objects for select
  using (
    bucket_id = 'chat-backgrounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "chat background object insert own" on storage.objects;
create policy "chat background object insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-backgrounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "chat background object update own" on storage.objects;
create policy "chat background object update own"
  on storage.objects for update
  using (
    bucket_id = 'chat-backgrounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'chat-backgrounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "chat background object delete own" on storage.objects;
create policy "chat background object delete own"
  on storage.objects for delete
  using (
    bucket_id = 'chat-backgrounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

revoke all on table public.chat_background_sync from anon;
grant select, insert, update, delete on table public.chat_background_sync to authenticated;

select
  to_regclass('public.chat_background_sync') is not null as chat_background_sync_ready,
  exists(select 1 from storage.buckets where id = 'chat-backgrounds') as chat_backgrounds_bucket_ready;
