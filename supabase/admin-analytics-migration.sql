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
          'name', deck -> 'name',
          'partnerColor', deck -> 'partnerColor',
          'caseCardId', deck -> 'caseCardId'
        ))
        from jsonb_array_elements(coalesce(state.data -> 'decks', '[]'::jsonb)) as deck
      ), '[]'::jsonb),
      'sessions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', session -> 'id',
          'deckId', session -> 'deckId',
          'deckVersion', session -> 'deckVersion',
          'partnerColor', session -> 'partnerColor',
          'caseCardId', session -> 'caseCardId',
          'name', session -> 'name',
          'date', session -> 'date',
          'environment', session -> 'environment',
          'placement', session -> 'placement',
          'randomPrizeWon', session -> 'randomPrizeWon',
          'randomPrizeMethod', session -> 'randomPrizeMethod'
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
          'opponentPassed', match -> 'opponentPassed',
          'opponentPartnerColor', match -> 'opponentPartnerColor',
          'opponentCaseCardId', match -> 'opponentCaseCardId',
          'opponentPlayerRecorded', case
            when coalesce(trim(match ->> 'opponentPlayer'), '') in ('', '不明', '未登録') then false
            else true
          end
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
