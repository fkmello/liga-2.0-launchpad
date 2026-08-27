
CREATE TABLE public.sheets_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  type text,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  synced_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_sheets_cache_key ON public.sheets_cache(cache_key);

ALTER TABLE public.sheets_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cache"
  ON public.sheets_cache FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage cache"
  ON public.sheets_cache FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
