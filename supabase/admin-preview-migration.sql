create or replace function public.get_admin_user_state(target_user_id uuid)
returns table (data jsonb, updated_at timestamptz)
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
  select state.data, state.updated_at
  from public.app_states as state
  where state.user_id = target_user_id;
end;
$$;

revoke all on function public.get_admin_user_state(uuid) from public;
grant execute on function public.get_admin_user_state(uuid) to authenticated;
