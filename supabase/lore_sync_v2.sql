-- Crack Lore Sync Bridge v2
-- 기존 lore_sync_state를 유지하면서 현재본 + 이전본 1개와 메타데이터 전용 조회를 지원함.

create table if not exists public.lore_sync_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  device_label text,
  schema_version integer not null default 1
);

alter table public.lore_sync_state add column if not exists content_hash text;
alter table public.lore_sync_state add column if not exists previous_ciphertext text;
alter table public.lore_sync_state add column if not exists previous_revision bigint;
alter table public.lore_sync_state add column if not exists previous_updated_at timestamptz;
alter table public.lore_sync_state add column if not exists previous_device_label text;
alter table public.lore_sync_state add column if not exists previous_schema_version integer;
alter table public.lore_sync_state add column if not exists previous_content_hash text;

alter table public.lore_sync_state enable row level security;

drop policy if exists "lore sync select own" on public.lore_sync_state;
create policy "lore sync select own"
  on public.lore_sync_state for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "lore sync insert own" on public.lore_sync_state;
create policy "lore sync insert own"
  on public.lore_sync_state for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "lore sync update own" on public.lore_sync_state;
create policy "lore sync update own"
  on public.lore_sync_state for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.save_lore_sync_state(
  p_ciphertext text,
  p_content_hash text,
  p_base_revision bigint,
  p_device_label text,
  p_schema_version integer
)
returns table (
  revision bigint,
  updated_at timestamptz,
  device_label text,
  schema_version integer,
  content_hash text,
  previous_revision bigint,
  previous_updated_at timestamptz,
  previous_device_label text,
  previous_schema_version integer,
  previous_content_hash text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_current public.lore_sync_state%rowtype;
begin
  if v_owner is null then
    raise exception 'authentication required';
  end if;
  if coalesce(length(p_ciphertext), 0) = 0 then
    raise exception 'ciphertext required';
  end if;
  if coalesce(length(p_content_hash), 0) = 0 or length(p_content_hash) > 128 then
    raise exception 'invalid content hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_current
    from public.lore_sync_state as state
    where state.owner_id = v_owner
    for update;

  if not found then
    if coalesce(p_base_revision, 0) <> 0 then
      raise exception 'lore sync conflict: expected empty state';
    end if;
    insert into public.lore_sync_state (
      owner_id, ciphertext, revision, updated_at, device_label, schema_version, content_hash
    ) values (
      v_owner, p_ciphertext, 1, now(), nullif(p_device_label, ''), greatest(coalesce(p_schema_version, 1), 1), p_content_hash
    );
  else
    if v_current.revision <> coalesce(p_base_revision, 0) then
      raise exception 'lore sync conflict: revision changed';
    end if;
    update public.lore_sync_state as state set
      previous_ciphertext = v_current.ciphertext,
      previous_revision = v_current.revision,
      previous_updated_at = v_current.updated_at,
      previous_device_label = v_current.device_label,
      previous_schema_version = v_current.schema_version,
      previous_content_hash = v_current.content_hash,
      ciphertext = p_ciphertext,
      revision = v_current.revision + 1,
      updated_at = now(),
      device_label = nullif(p_device_label, ''),
      schema_version = greatest(coalesce(p_schema_version, 1), 1),
      content_hash = p_content_hash
    where state.owner_id = v_owner;
  end if;

  return query
    select state.revision, state.updated_at, state.device_label, state.schema_version, state.content_hash,
           state.previous_revision, state.previous_updated_at, state.previous_device_label,
           state.previous_schema_version, state.previous_content_hash
    from public.lore_sync_state as state
    where state.owner_id = v_owner;
end;
$$;

revoke all on function public.save_lore_sync_state(text, text, bigint, text, integer) from public;
grant execute on function public.save_lore_sync_state(text, text, bigint, text, integer) to authenticated;

grant select, insert, update on public.lore_sync_state to authenticated;
