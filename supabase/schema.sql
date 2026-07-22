create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  ai_training_included boolean not null default true
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin')),
  created_at timestamptz not null default now()
);

alter table public.app_states enable row level security;
alter table public.profiles enable row level security;
alter table public.account_consents enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.app_states to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.account_consents to authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and role = 'superadmin'
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

create or replace function public.get_admin_app_states()
returns table (user_id uuid, data jsonb, updated_at timestamptz)
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
    state.user_id,
    jsonb_build_object(
      'decks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', deck -> 'id',
          'name', deck -> 'name'
        ))
        from jsonb_array_elements(coalesce(state.data -> 'decks', '[]'::jsonb)) as deck
      ), '[]'::jsonb),
      'sessions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', session -> 'id',
          'deckId', session -> 'deckId',
          'environment', session -> 'environment'
        ))
        from jsonb_array_elements(coalesce(state.data -> 'sessions', '[]'::jsonb)) as session
      ), '[]'::jsonb),
      'matches', coalesce((
        select jsonb_agg(jsonb_build_object(
          'sessionId', match -> 'sessionId',
          'myDeck', match -> 'myDeck',
          'opponentDeck', match -> 'opponentDeck',
          'result', match -> 'result',
          'firstPlayer', match -> 'firstPlayer',
          'opponentRps', match -> 'opponentRps',
          'myPassed', match -> 'myPassed',
          'opponentPassed', match -> 'opponentPassed'
        ))
        from jsonb_array_elements(coalesce(state.data -> 'matches', '[]'::jsonb)) as match
      ), '[]'::jsonb)
    ),
    state.updated_at
  from public.app_states as state;
end;
$$;

revoke all on function public.get_admin_app_states() from public;
grant execute on function public.get_admin_app_states() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null then
    requested_username := left(split_part(coalesce(new.email, 'user'), '@', 1), 20);
  end if;
  if char_length(requested_username) < 2 then
    requested_username := 'ユーザー';
  end if;

  insert into public.profiles (user_id, username)
  values (new.id, left(requested_username, 20))
  on conflict (user_id) do nothing;

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') = 'true' then
    insert into public.account_consents (user_id, terms_version, accepted_at, ai_training_included)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'terms_version', ''), 'unknown'),
      now(),
      true
    )
    on conflict (user_id) do nothing;
  end if;

  if lower(coalesce(new.email, '')) = '0harry0wilder0@gmail.com' then
    insert into public.admin_users (user_id, role)
    values (new.id, 'superadmin')
    on conflict (user_id) do update set role = excluded.role;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (user_id, username)
select
  id,
  case
    when char_length(left(coalesce(nullif(trim(raw_user_meta_data ->> 'username'), ''), split_part(coalesce(email, 'user'), '@', 1), 'ユーザー'), 20)) < 2 then 'ユーザー'
    else left(coalesce(nullif(trim(raw_user_meta_data ->> 'username'), ''), split_part(coalesce(email, 'user'), '@', 1), 'ユーザー'), 20)
  end
from auth.users
on conflict (user_id) do nothing;

insert into public.admin_users (user_id, role)
select id, 'superadmin'
from auth.users
where lower(email) = '0harry0wilder0@gmail.com'
on conflict (user_id) do update set role = excluded.role;

drop policy if exists "Users can read their own app state" on public.app_states;
create policy "Users can read their own app state"
  on public.app_states for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own app state" on public.app_states;
create policy "Users can insert their own app state"
  on public.app_states for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app state" on public.app_states;
create policy "Users can update their own app state"
  on public.app_states for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own app state" on public.app_states;
create policy "Users can delete their own app state"
  on public.app_states for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read profiles" on public.profiles;
create policy "Users can read profiles"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or public.is_superadmin());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read consents" on public.account_consents;
create policy "Users can read consents"
  on public.account_consents for select to authenticated
  using ((select auth.uid()) = user_id or public.is_superadmin());

drop policy if exists "Users can insert their own consent" on public.account_consents;
create policy "Users can insert their own consent"
  on public.account_consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own consent" on public.account_consents;
create policy "Users can update their own consent"
  on public.account_consents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own admin role" on public.admin_users;
create policy "Users can read their own admin role"
  on public.admin_users for select to authenticated
  using ((select auth.uid()) = user_id);
