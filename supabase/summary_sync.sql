-- Crack Personal AI Summary cross-device checkpoint and lock schema.
-- Run once in the same Supabase project used by Crack_Lore_Sync_Bridge.user.js.

create table if not exists public.summary_sync_state (
  owner_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null check (char_length(chat_id) between 1 and 128),
  batch_end_count integer not null check (batch_end_count >= 0 and batch_end_count % 20 = 0),
  batch_start_turn_id text not null default '',
  batch_end_turn_id text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  lock_owner text,
  locked_at timestamptz,
  completed_at timestamptz,
  payload_ciphertext text,
  created_summary_ids jsonb not null default '[]'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, chat_id, batch_end_count)
);

alter table public.summary_sync_state enable row level security;

drop policy if exists "summary sync select own" on public.summary_sync_state;
create policy "summary sync select own"
  on public.summary_sync_state for select
  using (auth.uid() = owner_id);

drop policy if exists "summary sync insert own" on public.summary_sync_state;
create policy "summary sync insert own"
  on public.summary_sync_state for insert
  with check (auth.uid() = owner_id);

drop policy if exists "summary sync update own" on public.summary_sync_state;
create policy "summary sync update own"
  on public.summary_sync_state for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create or replace function public.initialize_summary_checkpoint(
  p_chat_id text,
  p_batch_end_count integer,
  p_batch_end_turn_id text
)
returns setof public.summary_sync_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'not authenticated'; end if;
  if p_batch_end_count < 0 or p_batch_end_count % 20 <> 0 then raise exception 'invalid batch boundary'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_chat_id, 0));

  if not exists (
    select 1 from public.summary_sync_state
    where owner_id = v_owner and chat_id = p_chat_id
  ) then
    insert into public.summary_sync_state (
      owner_id, chat_id, batch_end_count, batch_end_turn_id,
      status, completed_at, updated_at
    ) values (
      v_owner, p_chat_id, p_batch_end_count, p_batch_end_turn_id,
      'completed', now(), now()
    ) on conflict do nothing;
  end if;

  return query
    select * from public.summary_sync_state
    where owner_id = v_owner and chat_id = p_chat_id and status = 'completed'
    order by batch_end_count desc
    limit 1;
end;
$$;

create or replace function public.claim_summary_batch(
  p_chat_id text,
  p_batch_start_turn_id text,
  p_batch_end_turn_id text,
  p_batch_end_count integer,
  p_lock_owner text,
  p_lock_ttl_seconds integer default 1800
)
returns table (
  claimed boolean,
  row_status text,
  row_lock_owner text,
  row_payload_ciphertext text,
  row_created_summary_ids jsonb,
  row_batch_start_turn_id text,
  row_batch_end_turn_id text,
  row_batch_end_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.summary_sync_state%rowtype;
begin
  if v_owner is null then raise exception 'not authenticated'; end if;
  if p_batch_end_count <= 0 or p_batch_end_count % 20 <> 0 then raise exception 'invalid batch boundary'; end if;
  if char_length(p_lock_owner) < 8 then raise exception 'invalid lock owner'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_chat_id || ':' || p_batch_end_count::text, 0));

  select * into v_row from public.summary_sync_state
  where owner_id = v_owner and chat_id = p_chat_id and batch_end_count = p_batch_end_count;

  if not found then
    insert into public.summary_sync_state (
      owner_id, chat_id, batch_end_count, batch_start_turn_id, batch_end_turn_id,
      status, lock_owner, locked_at, updated_at
    ) values (
      v_owner, p_chat_id, p_batch_end_count, p_batch_start_turn_id, p_batch_end_turn_id,
      'processing', p_lock_owner, now(), now()
    ) returning * into v_row;
    claimed := true;
  elsif v_row.status = 'completed' then
    claimed := false;
  elsif v_row.lock_owner = p_lock_owner
    or v_row.status = 'failed'
    or v_row.locked_at is null
    or v_row.locked_at < now() - make_interval(secs => greatest(p_lock_ttl_seconds, 60)) then
    update public.summary_sync_state set
      status = 'processing',
      lock_owner = p_lock_owner,
      locked_at = now(),
      last_error = null,
      updated_at = now()
    where owner_id = v_owner and chat_id = p_chat_id and batch_end_count = p_batch_end_count
    returning * into v_row;
    claimed := true;
  else
    claimed := false;
  end if;

  row_status := v_row.status;
  row_lock_owner := v_row.lock_owner;
  row_payload_ciphertext := v_row.payload_ciphertext;
  row_created_summary_ids := v_row.created_summary_ids;
  row_batch_start_turn_id := v_row.batch_start_turn_id;
  row_batch_end_turn_id := v_row.batch_end_turn_id;
  row_batch_end_count := v_row.batch_end_count;
  return next;
end;
$$;

create or replace function public.save_summary_batch_progress(
  p_chat_id text,
  p_batch_end_count integer,
  p_lock_owner text,
  p_payload_ciphertext text,
  p_created_summary_ids jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  update public.summary_sync_state set
    payload_ciphertext = coalesce(p_payload_ciphertext, payload_ciphertext),
    created_summary_ids = coalesce(p_created_summary_ids, created_summary_ids),
    locked_at = now(),
    updated_at = now()
  where owner_id = v_owner
    and chat_id = p_chat_id
    and batch_end_count = p_batch_end_count
    and status = 'processing'
    and lock_owner = p_lock_owner;

  if not found then raise exception 'summary batch lock lost'; end if;
end;
$$;

create or replace function public.complete_summary_batch(
  p_chat_id text,
  p_batch_end_count integer,
  p_lock_owner text,
  p_created_summary_ids jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  update public.summary_sync_state set
    status = 'completed',
    completed_at = now(),
    created_summary_ids = coalesce(p_created_summary_ids, created_summary_ids),
    payload_ciphertext = null,
    last_error = null,
    updated_at = now()
  where owner_id = v_owner
    and chat_id = p_chat_id
    and batch_end_count = p_batch_end_count
    and status = 'processing'
    and lock_owner = p_lock_owner;

  if not found then raise exception 'summary batch lock lost'; end if;
end;
$$;

create or replace function public.fail_summary_batch(
  p_chat_id text,
  p_batch_end_count integer,
  p_lock_owner text,
  p_last_error text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  update public.summary_sync_state set
    status = 'failed',
    last_error = left(coalesce(p_last_error, 'unknown error'), 500),
    updated_at = now()
  where owner_id = v_owner
    and chat_id = p_chat_id
    and batch_end_count = p_batch_end_count
    and status = 'processing'
    and lock_owner = p_lock_owner;
end;
$$;

revoke all on table public.summary_sync_state from anon;
grant select, insert, update on table public.summary_sync_state to authenticated;
revoke all on function public.initialize_summary_checkpoint(text, integer, text) from public;
revoke all on function public.claim_summary_batch(text, text, text, integer, text, integer) from public;
revoke all on function public.save_summary_batch_progress(text, integer, text, text, jsonb) from public;
revoke all on function public.complete_summary_batch(text, integer, text, jsonb) from public;
revoke all on function public.fail_summary_batch(text, integer, text, text) from public;
grant execute on function public.initialize_summary_checkpoint(text, integer, text) to authenticated;
grant execute on function public.claim_summary_batch(text, text, text, integer, text, integer) to authenticated;
grant execute on function public.save_summary_batch_progress(text, integer, text, text, jsonb) to authenticated;
grant execute on function public.complete_summary_batch(text, integer, text, jsonb) to authenticated;
grant execute on function public.fail_summary_batch(text, integer, text, text) to authenticated;
