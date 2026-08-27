CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_team_data jsonb;
  v_team jsonb;
  v_first_team_name text;
  v_league text;
BEGIN
  IF EXISTS (SELECT 1 FROM user_teams WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'USER_ALREADY_HAS_TEAMS';
  END IF;

  SELECT * INTO v_invite
  FROM invite_codes
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'CODE_ALREADY_USED';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'CODE_EXPIRED';
  END IF;

  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE id = v_invite.id;

  v_team_data := v_invite.team_data;
  v_first_team_name := NULL;

  FOR v_team IN SELECT * FROM jsonb_array_elements(v_team_data)
  LOOP
    v_league := CASE upper(coalesce(v_team->>'serie',''))
      WHEN 'W' THEN 'copa_mundo'
      WHEN 'L' THEN 'campeoes'
      ELSE 'brasileirao'
    END;

    INSERT INTO user_teams (user_id, id_cartola, team_name, serie, league)
    VALUES (
      p_user_id,
      v_team->>'id_cartola',
      v_team->>'team_name',
      v_team->>'serie',
      v_league
    );

    IF v_first_team_name IS NULL THEN
      v_first_team_name := v_team->>'team_name';
    END IF;
  END LOOP;

  UPDATE profiles
  SET team_name = v_first_team_name,
      cartoleiro_name = v_first_team_name
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'teams', v_team_data);
END;
$function$;