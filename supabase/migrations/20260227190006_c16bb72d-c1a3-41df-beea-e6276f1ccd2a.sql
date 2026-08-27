
CREATE TABLE public.league_closed_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,
  season_year integer NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  UNIQUE (period_key, season_year)
);

ALTER TABLE public.league_closed_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read closed periods"
  ON public.league_closed_periods
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert closed periods"
  ON public.league_closed_periods
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete closed periods"
  ON public.league_closed_periods
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
