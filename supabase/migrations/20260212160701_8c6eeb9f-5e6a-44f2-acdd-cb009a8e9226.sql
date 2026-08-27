
-- Tabela invite_codes
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  team_data jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invite codes"
ON public.invite_codes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can validate codes"
ON public.invite_codes FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Índice para busca por used_at
CREATE INDEX idx_invite_codes_used_at ON public.invite_codes(used_at);

-- Tabela user_teams
CREATE TABLE public.user_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  id_cartola text NOT NULL,
  team_name text NOT NULL,
  serie text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own teams"
ON public.user_teams FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all teams"
ON public.user_teams FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert teams"
ON public.user_teams FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX idx_user_teams_user_id ON public.user_teams(user_id);
CREATE UNIQUE INDEX idx_user_teams_user_id_cartola ON public.user_teams(user_id, id_cartola);

-- Função transacional redeem_invite_code
CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite invite_codes%ROWTYPE;
  v_team_data jsonb;
  v_team jsonb;
  v_first_team_name text;
BEGIN
  -- Verifica se usuário já tem times
  IF EXISTS (SELECT 1 FROM user_teams WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'USER_ALREADY_HAS_TEAMS';
  END IF;

  -- Lock na linha do código
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

  -- Marca código como usado
  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE id = v_invite.id;

  -- Insere times do usuário
  v_team_data := v_invite.team_data;
  v_first_team_name := NULL;

  FOR v_team IN SELECT * FROM jsonb_array_elements(v_team_data)
  LOOP
    INSERT INTO user_teams (user_id, id_cartola, team_name, serie)
    VALUES (
      p_user_id,
      v_team->>'id_cartola',
      v_team->>'team_name',
      v_team->>'serie'
    );

    IF v_first_team_name IS NULL THEN
      v_first_team_name := v_team->>'team_name';
    END IF;
  END LOOP;

  -- Atualiza profile com nome do primeiro time
  UPDATE profiles
  SET team_name = v_first_team_name,
      cartoleiro_name = v_first_team_name
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'teams', v_team_data);
END;
$$;
