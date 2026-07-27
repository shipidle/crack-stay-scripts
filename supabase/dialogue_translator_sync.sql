-- Crack Dialogue Translator v0.2 cloud sync
-- Lore Sync와 같은 Supabase 프로젝트의 SQL Editor에서 한 번만 실행하세요.

create table if not exists public.dialogue_translator_sync (
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_key text not null check (char_length(room_key) between 1 and 500),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  revision bigint not null default 1 check (revision >= 1),
  device_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, room_key)
);

alter table public.dialogue_translator_sync enable row level security;

drop policy if exists "dialogue translator select own" on public.dialogue_translator_sync;
create policy "dialogue translator select own"
  on public.dialogue_translator_sync for select
  using (auth.uid() = owner_id);

drop policy if exists "dialogue translator insert own" on public.dialogue_translator_sync;
create policy "dialogue translator insert own"
  on public.dialogue_translator_sync for insert
  with check (auth.uid() = owner_id);

drop policy if exists "dialogue translator update own" on public.dialogue_translator_sync;
create policy "dialogue translator update own"
  on public.dialogue_translator_sync for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "dialogue translator delete own" on public.dialogue_translator_sync;
create policy "dialogue translator delete own"
  on public.dialogue_translator_sync for delete
  using (auth.uid() = owner_id);

create or replace function public.set_dialogue_translator_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dialogue_translator_updated_at on public.dialogue_translator_sync;
create trigger dialogue_translator_updated_at
before update on public.dialogue_translator_sync
for each row execute function public.set_dialogue_translator_updated_at();

revoke all on table public.dialogue_translator_sync from anon;
grant select, insert, update, delete on table public.dialogue_translator_sync to authenticated;

select to_regclass('public.dialogue_translator_sync') is not null as dialogue_translator_sync_ready;
