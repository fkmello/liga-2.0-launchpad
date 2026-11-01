-- Atomic, admin-only publication of a reviewed season snapshot.
-- No profile association is inferred: profile_id remains NULL unless a future
-- audited historical identity mapping is explicitly added.
CREATE OR REPLACE FUNCTION public.archive_season_history(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_archive_id uuid;
  v_season integer;
  v_league text;
  v_standings jsonb;
  v_competitions jsonb;
  v_row jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem arquivar temporadas.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload de arquivamento inválido.';
  END IF;

  v_season := (p_payload->>'season')::integer;
  v_league := COALESCE(NULLIF(trim(p_payload->>'league'), ''), 'liga-jacarandas');
  v_standings := p_payload->'standings';
  v_competitions := p_payload->'competitions';

  IF v_season IS NULL OR v_season < 2000 OR v_season > 2200 THEN
    RAISE EXCEPTION 'Temporada inválida.';
  END IF;
  IF jsonb_typeof(v_standings) <> 'array' OR jsonb_array_length(v_standings) = 0 THEN
    RAISE EXCEPTION 'A classificação anual está vazia; arquivamento cancelado.';
  END IF;
  IF jsonb_typeof(v_competitions) <> 'array' THEN
    RAISE EXCEPTION 'A lista de torneios está inválida.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_standings) s
    WHERE NULLIF(trim(s->>'team_name'), '') IS NULL
       OR NULLIF(s->>'position', '') IS NULL
       OR NULLIF(s->>'total_points', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Há equipe sem nome, posição ou pontuação. Corrija a classificação antes de arquivar.';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(v_standings))
     <> (SELECT count(DISTINCT (s->>'position')::integer) FROM jsonb_array_elements(v_standings) s) THEN
    RAISE EXCEPTION 'Existem posições duplicadas na classificação.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_competitions) c
    WHERE NULLIF(trim(c->>'slug'), '') IS NULL
       OR NULLIF(trim(c->>'name'), '') IS NULL
       OR COALESCE(c->>'status', '') NOT IN ('complete', 'pending', 'not_played')
  ) THEN
    RAISE EXCEPTION 'Há torneio com identificação ou status inválido.';
  END IF;

  INSERT INTO public.season_archives
    (league, season, status, summary, archived_at, archived_by, created_by)
  VALUES
    (v_league, v_season, 'archived',
     COALESCE(p_payload->'summary', '{}'::jsonb),
     now(), auth.uid(), auth.uid())
  RETURNING id INTO v_archive_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_standings)
  LOOP
    INSERT INTO public.season_archive_standings
      (archive_id, position, profile_id, cartola_team_id, team_name,
       manager_name, badge_url, total_points, source_snapshot)
    VALUES
      (v_archive_id,
       (v_row->>'position')::integer,
       NULL,
       NULLIF(v_row->>'cartola_team_id', ''),
       trim(v_row->>'team_name'),
       NULLIF(trim(v_row->>'manager_name'), ''),
       NULLIF(v_row->>'badge_url', ''),
       (v_row->>'total_points')::numeric,
       COALESCE(v_row->'source_snapshot', '{}'::jsonb));
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_competitions)
  LOOP
    INSERT INTO public.season_archive_competitions
      (archive_id, tournament_slug, tournament_name, source_provider,
       source_format, status, champion_name, champion_badge_url,
       runner_up_name, runner_up_badge_url, third_place_name,
       third_place_badge_url, final_score, source_snapshot)
    VALUES
      (v_archive_id,
       trim(v_row->>'slug'),
       trim(v_row->>'name'),
       NULLIF(v_row->>'source_provider', ''),
       NULLIF(v_row->>'source_format', ''),
       v_row->>'status',
       NULLIF(v_row->>'champion_name', ''),
       NULLIF(v_row->>'champion_badge_url', ''),
       NULLIF(v_row->>'runner_up_name', ''),
       NULLIF(v_row->>'runner_up_badge_url', ''),
       NULLIF(v_row->>'third_place_name', ''),
       NULLIF(v_row->>'third_place_badge_url', ''),
       COALESCE(v_row->'final_score', '{}'::jsonb),
       COALESCE(v_row->'source_snapshot', '{}'::jsonb));
  END LOOP;

  INSERT INTO public.season_archive_events (archive_id, actor_id, event_type, details)
  VALUES (
    v_archive_id, auth.uid(), 'archived',
    jsonb_build_object(
      'standings_count', jsonb_array_length(v_standings),
      'competitions_count', jsonb_array_length(v_competitions),
      'generated_at', p_payload->'summary'->>'generatedAt'
    )
  );

  RETURN v_archive_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta liga já possui um arquivo para a temporada %.', v_season
      USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_season_history(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_season_history(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_season_history(jsonb) TO authenticated;
