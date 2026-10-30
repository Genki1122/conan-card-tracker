DO $$
BEGIN
  IF EXISTS (
    (SELECT user_id, fingerprint FROM history_setup_before
     EXCEPT SELECT user_id, md5(row(state.*)::text) FROM public.app_states AS state)
    UNION ALL
    (SELECT user_id, md5(row(state.*)::text) FROM public.app_states AS state
     EXCEPT SELECT user_id, fingerprint FROM history_setup_before)
  ) THEN RAISE EXCEPTION 'Existing records changed during history setup'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.app_states'::regclass AND tgname = 'capture_app_state_version_before_change' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'History trigger was not enabled';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_state_versions'::regclass)
    OR has_table_privilege('anon', 'public.app_state_versions', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.app_state_versions', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'History access protections are incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_states AS state WHERE NOT EXISTS (SELECT 1 FROM public.app_state_versions AS version WHERE version.user_id = state.user_id)) THEN
    RAISE EXCEPTION 'Initial history is incomplete';
  END IF;
END $$;
