CREATE TABLE public.league_disabled_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_key text NOT NULL,
  season_year integer NOT NULL,
  disabled_at timestamp with time zone NOT NULL DEFAULT now(),
  disabled_by uuid,
  UNIQUE (period_key, season_year)
);

GRANT SELECT, INSERT, DELETE ON public.league_disabled_periods TO authenticated;
GRANT ALL ON public.league_disabled_periods TO service_role;

ALTER TABLE public.league_disabled_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read disabled periods"
  ON public.league_disabled_periods FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert disabled periods"
  ON public.league_disabled_periods FOR INSERT
  TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete disabled periods"
  ON public.league_disabled_periods FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));