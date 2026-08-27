
CREATE TABLE public.tournament_settings (
  slug TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tournament settings"
  ON public.tournament_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage tournament settings"
  ON public.tournament_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.tournament_settings (slug) VALUES
  ('brasileirao-serie-a'), ('brasileirao-serie-b'), ('brasileirao-serie-c'),
  ('copa-do-brasil'), ('libertadores'), ('sulamericana'), ('copa-intercontinental');
