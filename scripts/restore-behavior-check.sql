BEGIN;
SET LOCAL session_replication_role = origin;

DO $$
BEGIN
  IF to_regclass('public.app_state_versions') IS NULL THEN
    RAISE EXCEPTION 'History table is absent from saved production schema';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.app_states'::regclass
      AND tgname = 'capture_app_state_version_before_change'
      AND tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION 'History trigger is absent or disabled';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.app_states'::regclass, 'public.app_state_versions'::regclass) AND relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'Required row-level security is disabled';
  END IF;
  IF has_table_privilege('anon', 'public.app_state_versions', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.app_state_versions', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'History is directly accessible to application clients';
  END IF;
  IF (SELECT count(*) FROM public.app_states) < 2 THEN
    RAISE EXCEPTION 'At least two saved users are needed for the isolation test';
  END IF;
END $$;

-- Exercise only the disconnected clone, with every mutation rolled back.
DO $$
DECLARE
  target uuid;
  previous jsonb;
  changed jsonb;
BEGIN
  SELECT user_id, data INTO target, previous FROM public.app_states ORDER BY user_id LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'No saved record to test'; END IF;
  PERFORM set_config('restore_check.user_id', target::text, true);
  PERFORM set_config('restore_check.other_id', (SELECT user_id::text FROM public.app_states WHERE user_id <> target LIMIT 1), true);
  DELETE FROM public.app_state_versions WHERE user_id = target;
  changed := previous || '{"restoreCheck":"temporary"}'::jsonb;
  UPDATE public.app_states SET data = changed, updated_at = now() WHERE user_id = target;
  IF (SELECT count(*) FROM public.app_state_versions WHERE user_id = target AND data = previous) <> 1 THEN
    RAISE EXCEPTION 'Update did not capture the previous complete record';
  END IF;
  DELETE FROM public.app_states WHERE user_id = target;
  IF (SELECT count(*) FROM public.app_state_versions WHERE user_id = target AND data = changed) <> 1 THEN
    RAISE EXCEPTION 'Delete did not capture the previous complete record';
  END IF;
  INSERT INTO public.app_states (user_id, data, updated_at) VALUES (target, previous, now());
END $$;

SELECT set_config('request.jwt.claim.sub', current_setting('restore_check.user_id'), true) IS NOT NULL;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  affected integer;
  previous jsonb;
  own_id uuid := current_setting('restore_check.user_id')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.app_states) <> 1 THEN
    RAISE EXCEPTION 'User cannot see exactly their own record';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_states WHERE user_id <> current_setting('restore_check.user_id')::uuid) THEN
    RAISE EXCEPTION 'Other users records are visible';
  END IF;
  UPDATE public.app_states SET updated_at = now() WHERE user_id <> current_setting('restore_check.user_id')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Other users records are writable'; END IF;
  DELETE FROM public.app_states WHERE user_id <> own_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Other users records are deletable'; END IF;
  BEGIN
    INSERT INTO public.app_states (user_id, data) VALUES (current_setting('restore_check.other_id')::uuid, '{}'::jsonb);
    RAISE EXCEPTION 'Cross-user insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT data INTO previous FROM public.app_states WHERE user_id = own_id;
  UPDATE public.app_states SET data = data || '{"restoreCheck":"own-write"}'::jsonb WHERE user_id = own_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Own update failed'; END IF;
  DELETE FROM public.app_states WHERE user_id = own_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Own delete failed'; END IF;
  INSERT INTO public.app_states (user_id, data) VALUES (own_id, previous);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Own insert failed'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true) IS NOT NULL;
SELECT set_config('request.jwt.claims', '{}', true) IS NOT NULL;
SET LOCAL ROLE anon;
DO $$
DECLARE affected integer;
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.app_states) THEN RAISE EXCEPTION 'Anonymous read was allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.app_states (user_id, data) VALUES (current_setting('restore_check.user_id')::uuid, '{}'::jsonb);
    RAISE EXCEPTION 'Anonymous insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.app_states SET updated_at = now();
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Anonymous update was allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.app_states;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Anonymous delete was allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE synthetic_user uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (synthetic_user, synthetic_user::text || '@example.invalid', '{"username":"restore-check"}'::jsonb);
  INSERT INTO public.app_states (user_id, data) VALUES (synthetic_user, '{}'::jsonb);
  UPDATE public.app_states SET data = '{"restoreCheck":true}'::jsonb WHERE user_id = synthetic_user;
  DELETE FROM auth.users WHERE id = synthetic_user;
  IF EXISTS (SELECT 1 FROM public.app_states WHERE user_id = synthetic_user)
    OR EXISTS (SELECT 1 FROM public.app_state_versions WHERE user_id = synthetic_user) THEN
    RAISE EXCEPTION 'Account deletion did not cascade correctly';
  END IF;
END $$;
ROLLBACK;
