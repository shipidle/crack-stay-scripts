-- Crack Profile Portrait HUD v0.3 cloud sync
-- Supabase SQL Editor에서 한 번만 실행함.

create table if not exists public.profile_portrait_sync (
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_key text not null,
  state jsonb not null default '{}'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  device_label text not null default '내 기기',
  updated_at timestamptz not null default now(),
  primary key (owner_id, room_key)
);

alter table public.profile_portrait_sync enable row level security;

drop policy if exists "profile portrait select own" on public.profile_portrait_sync;
create policy "profile portrait select own"
on public.profile_portrait_sync for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "profile portrait insert own" on public.profile_portrait_sync;
create policy "profile portrait insert own"
on public.profile_portrait_sync for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "profile portrait update own" on public.profile_portrait_sync;
create policy "profile portrait update own"
on public.profile_portrait_sync for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "profile portrait delete own" on public.profile_portrait_sync;
create policy "profile portrait delete own"
on public.profile_portrait_sync for delete
to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.set_profile_portrait_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profile_portrait_updated_at on public.profile_portrait_sync;
create trigger profile_portrait_updated_at
before update on public.profile_portrait_sync
for each row execute function public.set_profile_portrait_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-portraits',
  'profile-portraits',
  false,
  358400,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile portrait storage select own" on storage.objects;
create policy "profile portrait storage select own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-portraits'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile portrait storage insert own" on storage.objects;
create policy "profile portrait storage insert own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-portraits'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile portrait storage update own" on storage.objects;
create policy "profile portrait storage update own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-portraits'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-portraits'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile portrait storage delete own" on storage.objects;
create policy "profile portrait storage delete own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-portraits'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant select, insert, update, delete on public.profile_portrait_sync to authenticated;

-- 새 테이블을 Data API가 즉시 인식하도록 PostgREST 스키마 캐시를 갱신함.
notify pgrst, 'reload schema';

-- 실행 결과가 true / true인지 확인함.
select
  to_regclass('public.profile_portrait_sync') is not null as profile_portrait_sync_ready,
  exists(select 1 from storage.buckets where id = 'profile-portraits') as profile_portraits_bucket_ready;
