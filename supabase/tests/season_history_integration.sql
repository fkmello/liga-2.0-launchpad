\set ON_ERROR_STOP on
-- Apply only the two season-history migrations to a disposable PostgreSQL database.
\i supabase/migrations/20261031193000_season_history_foundation.sql
\i supabase/migrations/20261101130000_archive_season_history_rpc.sql

DO $$
DECLARE
  v_id uuid;
  v_payload jsonb := '{
    "league":"ci-test","season":2098,
    "summary":{"seasonFinalized":true,"generatedAt":"ci"},
    "standings":[
      {"position":1,"team_name":"Time A","total_points":123.45},
      {"position":2,"team_name":"Time B","total_points":100.25}
    ],
    "competitions":[
      {"slug":"copa-teste","name":"Copa Teste","status":"complete",
       "champion_name":"Time A","runner_up_name":"Time B"}
    ]
  }'::jsonb;
BEGIN
  -- The function is locked down to the authenticated role and must reject a normal user.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  BEGIN
    PERFORM public.archive_season_history(v_payload);
    RAISE EXCEPTION 'FAIL: non-admin was allowed to archive';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Strict boolean confirmation: the string "true" must not pass.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  BEGIN
    PERFORM public.archive_season_history(
      jsonb_set(v_payload,'{summary,seasonFinalized}','"true"'::jsonb)
    );
    RAISE EXCEPTION 'FAIL: string seasonFinalized was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'FAIL: string seasonFinalized was accepted' THEN RAISE; END IF;
  END;

  v_id := public.archive_season_history(v_payload);
  IF (SELECT count(*) FROM public.season_archive_standings WHERE archive_id=v_id) <> 2 THEN
    RAISE EXCEPTION 'FAIL: standings were not inserted';
  END IF;
  IF (SELECT count(*) FROM public.season_archive_competitions WHERE archive_id=v_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: competition was not inserted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.season_archive_standings WHERE archive_id=v_id AND profile_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: profile_id should remain NULL';
  END IF;

  -- Duplicate league/season is rejected and does not create another archive.
  BEGIN
    PERFORM public.archive_season_history(v_payload);
    RAISE EXCEPTION 'FAIL: duplicate archive was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.season_archives WHERE league='ci-test' AND season=2098) <> 1 THEN
    RAISE EXCEPTION 'FAIL: duplicate archive changed stored data';
  END IF;

  -- An insert-time numeric overflow must roll back the parent and earlier child rows.
  BEGIN
    PERFORM public.archive_season_history(jsonb_set(
      jsonb_set(v_payload,'{season}','2099'::jsonb),
      '{standings,0,total_points}', to_jsonb(repeat('9',40))
    ));
    RAISE EXCEPTION 'FAIL: numeric overflow payload unexpectedly succeeded';
  EXCEPTION WHEN numeric_value_out_of_range THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.season_archives WHERE league='ci-test' AND season=2099) THEN
    RAISE EXCEPTION 'FAIL: failed archive was not atomic';
  END IF;
END $$;

-- Exercise RLS as authenticated non-admin: only published archives are visible.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.season_archives WHERE league='ci-test') <> 1 THEN
    RAISE EXCEPTION 'FAIL: authenticated user cannot read published archive';
  END IF;
  IF has_table_privilege(current_user,'public.season_archives','INSERT') THEN
    RAISE EXCEPTION 'FAIL: authenticated role has direct INSERT privilege';
  END IF;
END $$;
RESET ROLE;

-- Confirm RPC is not executable by anon.
SET ROLE anon;
DO $$
BEGIN
  IF has_function_privilege(current_user,'public.archive_season_history(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute archive RPC';
  END IF;
END $$;
RESET ROLE;

SELECT 'season history PostgreSQL integration tests: PASS' AS result;
