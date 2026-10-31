-- Histórico permanente de temporadas da Liga Jacarandás.
-- O arquivo é separado dos caches operacionais e só pode ser alterado por administradores.

CREATE TABLE IF NOT EXISTS public.season_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league text NOT NULL,
  season integer NOT NULL CHECK (season >= 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'archived')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_archives_league_season_key UNIQUE (league, season),
  CONSTRAINT season_archives_archive_state_check CHECK (
    (status = 'draft' AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.season_archive_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id uuid NOT NULL REFERENCES public.season_archives(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cartola_team_id text,
  team_name text NOT NULL,
  manager_name text,
  badge_url text,
  total_points numeric(14, 4) NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_archive_standings_position_key UNIQUE (archive_id, position)
);

CREATE TABLE IF NOT EXISTS public.season_archive_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id uuid NOT NULL REFERENCES public.season_archives(id) ON DELETE CASCADE,
  tournament_slug text NOT NULL,
  tournament_name text NOT NULL,
  source_provider text,
  source_format text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'not_played')),
  champion_name text,
  champion_badge_url text,
  runner_up_name text,
  runner_up_badge_url text,
  third_place_name text,
  third_place_badge_url text,
  final_score jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT season_archive_competitions_slug_key UNIQUE (archive_id, tournament_slug)
);

CREATE TABLE IF NOT EXISTS public.season_archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id uuid NOT NULL REFERENCES public.season_archives(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'archived', 'reopened')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS season_archives_status_season_idx
  ON public.season_archives (status, season DESC);
CREATE INDEX IF NOT EXISTS season_archive_standings_archive_points_idx
  ON public.season_archive_standings (archive_id, total_points DESC);
CREATE INDEX IF NOT EXISTS season_archive_competitions_archive_idx
  ON public.season_archive_competitions (archive_id, tournament_name);

ALTER TABLE public.season_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_archive_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_archive_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_archive_events ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode consultar apenas temporadas publicadas.
-- Administradores também podem revisar rascunhos e gerenciar o arquivo.
CREATE POLICY "Authenticated can read published season archives"
  ON public.season_archives FOR SELECT TO authenticated
  USING (status = 'archived' OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage season archives"
  ON public.season_archives FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated can read standings from published archives"
  ON public.season_archive_standings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.season_archives a
    WHERE a.id = archive_id AND (a.status = 'archived' OR public.is_admin(auth.uid()))
  ));
CREATE POLICY "Admins can manage archived standings"
  ON public.season_archive_standings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated can read competitions from published archives"
  ON public.season_archive_competitions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.season_archives a
    WHERE a.id = archive_id AND (a.status = 'archived' OR public.is_admin(auth.uid()))
  ));
CREATE POLICY "Admins can manage archived competitions"
  ON public.season_archive_competitions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can read season archive events"
  ON public.season_archive_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert season archive events"
  ON public.season_archive_events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND actor_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_archives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_archive_standings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.season_archive_competitions TO authenticated;
GRANT SELECT, INSERT ON public.season_archive_events TO authenticated;
GRANT ALL ON public.season_archives TO service_role;
GRANT ALL ON public.season_archive_standings TO service_role;
GRANT ALL ON public.season_archive_competitions TO service_role;
GRANT ALL ON public.season_archive_events TO service_role;
