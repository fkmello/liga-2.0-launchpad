DROP INDEX IF EXISTS public.idx_user_teams_user_id_cartola;
CREATE UNIQUE INDEX idx_user_teams_user_id_cartola_league
  ON public.user_teams (user_id, id_cartola, league);