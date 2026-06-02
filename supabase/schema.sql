create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.app_states to authenticated;

drop policy if exists "Users can read their own app state" on public.app_states;
create policy "Users can read their own app state"
  on public.app_states
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own app state" on public.app_states;
create policy "Users can insert their own app state"
  on public.app_states
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own app state" on public.app_states;
create policy "Users can update their own app state"
  on public.app_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
