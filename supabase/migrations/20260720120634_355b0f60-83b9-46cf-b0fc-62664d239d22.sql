ALTER TABLE public.tournament_settings ADD COLUMN IF NOT EXISTS finished boolean NOT NULL DEFAULT false;
UPDATE public.tournament_settings SET finished = true WHERE slug = 'champions-league';