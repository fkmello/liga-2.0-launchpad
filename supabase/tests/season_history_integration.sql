\set ON_ERROR_STOP on
-- Apply only the two season-history migrations to a disposable PostgreSQL database.
\i supabase/migrations/20261031193000_season_history_foundation.sql
\i supabase/migrations/20261101130000_archive_season_history_rpc.sql
\i supabase/migrations/20261107153000_classic_league_snapshots.sql

-- Validate the classic-league snapshot schema, access boundaries and invariants.
DO $body$
BEGIN
  IF to_regclass('public.classic_league_round_snapshots') IS NULL
     OR to_regclass('public.classic_league_team_round_points') IS NULL THEN
    RAISE EXCEPTION 'FAIL: classic league snapshot tables were not created';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.classic_league_round_snapshots'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.classic_league_team_round_points'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS is not enabled on snapshot tables';
  END IF;
  IF has_table_privilege('anon','public.classic_league_round_snapshots','SELECT')
     OR has_table_privilege('authenticated','public.classic_league_team_round_points','INSERT') THEN
    RAISE EXCEPTION 'FAIL: client roles have direct access to snapshot tables';
  END IF;
  IF NOT has_table_privilege('service_role','public.classic_league_round_snapshots','SELECT')
     OR NOT has_table_privilege('service_role','public.classic_league_team_round_points','INSERT') THEN
    RAISE EXCEPTION 'FAIL: service_role lacks snapshot access';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='league_closed_periods'
      AND column_name='baseline_round'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='league_closed_periods'
      AND column_name='final_round'
  ) THEN
    RAISE EXCEPTION 'FAIL: closed period round boundary columns are missing';
  END IF;

  BEGIN
    INSERT INTO public.classic_league_round_snapshots
      (season_year, round_number, status, expected_team_count, received_team_count, completed_at)
    VALUES (2096, 1, 'complete', 60, 59, now());
    RAISE EXCEPTION 'FAIL: incomplete snapshot was accepted as complete';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $body$;


INSERT INTO public.season_archives (league, season, status, summary)
VALUES ('ci-draft-visibility', 2097, 'draft', '{}'::jsonb);

SET ROLE authenticated;
DO $body$
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
  -- Invoke the RPC as authenticated, matching the Supabase Data API SQL role.
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
  IF (SELECT count(*) FROM public.season_archives WHERE league='ci-draft-visibility') <> 1 THEN
    RAISE EXCEPTION 'FAIL: admin cannot read draft archive';
  END IF;
  IF has_table_privilege(current_user,'public.season_archives','INSERT')
     OR has_table_privilege(current_user,'public.season_archives','UPDATE')
     OR has_table_privilege(current_user,'public.season_archives','DELETE') THEN
    RAISE EXCEPTION 'FAIL: authenticated role has direct write privileges';
  END IF;
END $body$;
RESET ROLE;

-- A normal authenticated user can read published rows but must not see drafts.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $body$
BEGIN
  IF (SELECT count(*) FROM public.season_archives WHERE league='ci-test') <> 1 THEN
    RAISE EXCEPTION 'FAIL: authenticated user cannot read published archive';
  END IF;
  IF (SELECT count(*) FROM public.season_archives WHERE league='ci-draft-visibility') <> 0 THEN
    RAISE EXCEPTION 'FAIL: draft archive leaked to non-admin';
  END IF;
  IF has_table_privilege(current_user,'public.season_archives','INSERT') THEN
    RAISE EXCEPTION 'FAIL: authenticated role has direct INSERT privilege';
  END IF;
END $body$;
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
