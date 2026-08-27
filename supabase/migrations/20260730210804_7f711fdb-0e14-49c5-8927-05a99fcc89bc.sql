CREATE TABLE public.tournament_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league text NOT NULL,
  season integer NOT NULL,
  current_round integer,
  market_status integer,
  market_opened_at timestamptz,
  synced_round integer,
  first_sync_at timestamptz,
  second_sync_done boolean NOT NULL DEFAULT false,
  last_sync_status text CHECK (last_sync_status IN ('SUCCESS','FAILED','SKIPPED')),
  last_sync_phase text NOT NULL DEFAULT 'NONE' CHECK (last_sync_phase IN ('NONE','SYNC_1','SYNC_2')),
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tournament_sync_state_league_season_idx
  ON public.tournament_sync_state (league, season);

GRANT SELECT ON public.tournament_sync_state TO authenticated;
GRANT ALL ON public.tournament_sync_state TO service_role;

ALTER TABLE public.tournament_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync state"
  ON public.tournament_sync_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tournament_sync_state_updated_at
  BEFORE UPDATE ON public.tournament_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();