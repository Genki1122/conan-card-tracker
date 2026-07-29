create table if not exists public.account_recovery_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('detected', 'reviewing', 'saving', 'failed', 'resolved')),
  anonymous_decks integer not null default 0 check (anonymous_decks >= 0),
  anonymous_sessions integer not null default 0 check (anonymous_sessions >= 0),
  anonymous_matches integer not null default 0 check (anonymous_matches >= 0),
  ambiguous_count integer not null default 0 check (ambiguous_count >= 0),
  error_code text not null default '',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.account_recovery_status enable row level security;

grant select, insert, update, delete on public.account_recovery_status to authenticated;

drop policy if exists "Users can read their own recovery status" on public.account_recovery_status;
create policy "Users can read their own recovery status"
  on public.account_recovery_status for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own recovery status" on public.account_recovery_status;
create policy "Users can insert their own recovery status"
  on public.account_recovery_status for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own recovery status" on public.account_recovery_status;
create policy "Users can update their own recovery status"
  on public.account_recovery_status for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own recovery status" on public.account_recovery_status;
create policy "Users can delete their own recovery status"
  on public.account_recovery_status for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_admin_recovery_statuses()
returns table (
  user_id uuid,
  status text,
  anonymous_decks integer,
  anonymous_sessions integer,
  anonymous_matches integer,
  ambiguous_count integer,
  error_code text,
  detected_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    recovery.user_id,
    recovery.status,
    recovery.anonymous_decks,
    recovery.anonymous_sessions,
    recovery.anonymous_matches,
    recovery.ambiguous_count,
    recovery.error_code,
    recovery.detected_at,
    recovery.resolved_at,
    recovery.updated_at
  from public.account_recovery_status as recovery;
end;
$$;

revoke all on function public.get_admin_recovery_statuses() from public;
grant execute on function public.get_admin_recovery_statuses() to authenticated;
