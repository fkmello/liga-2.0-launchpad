-- Liga Clássica: snapshots acumulados por rodada e referências dos períodos.
-- Esta migration cria a estrutura para registrar os limites históricos após confirmação.
-- Nenhum ranking existente em sheets_cache é alterado.

CREATE TABLE IF NOT EXISTS public.classic_league_round_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year integer NOT NULL CHECK (season_year >= 2000),
  round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 38),
  source text NOT NULL DEFAULT 'cartola_api',
  source_endpoint text,
  market_round integer,
  market_status integer,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete', 'failed')),
  expected_team_count integer NOT NULL DEFAULT 60 CHECK (expected_team_count > 0),
  received_team_count integer NOT NULL DEFAULT 0 CHECK (received_team_count >= 0),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classic_league_round_snapshots_season_round_key
    UNIQUE (season_year, round_number),
  CONSTRAINT classic_league_round_snapshots_completion_check
    CHECK (
      (status = 'complete' AND completed_at IS NOT NULL
        AND received_team_count = expected_team_count)
      OR status IN ('in_progress', 'failed')
    )
);

CREATE TABLE IF NOT EXISTS public.classic_league_team_round_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL
    REFERENCES public.classic_league_round_snapshots(id) ON DELETE CASCADE,
  cartola_team_id text NOT NULL,
  team_name text NOT NULL,
  badge_url text,
  points_championship numeric(14, 4) NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classic_league_team_round_points_snapshot_team_key
    UNIQUE (snapshot_id, cartola_team_id)
);

CREATE INDEX IF NOT EXISTS classic_league_round_snapshots_season_status_idx
  ON public.classic_league_round_snapshots (season_year, status, round_number DESC);

CREATE INDEX IF NOT EXISTS classic_league_team_round_points_team_idx
  ON public.classic_league_team_round_points (cartola_team_id, snapshot_id);

ALTER TABLE public.classic_league_round_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classic_league_team_round_points ENABLE ROW LEVEL SECURITY;

-- Os snapshots são escritos e consultados pelo backend privilegiado.
-- Não conceder acesso direto aos clientes: isso também evita depender da
-- exposição automática de novas tabelas no Data API.
REVOKE ALL ON public.classic_league_round_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.classic_league_team_round_points FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.classic_league_round_snapshots TO service_role;
GRANT ALL ON public.classic_league_team_round_points TO service_role;

ALTER TABLE public.league_closed_periods
  ADD COLUMN IF NOT EXISTS baseline_round integer,
  ADD COLUMN IF NOT EXISTS final_round integer,
  ADD COLUMN IF NOT EXISTS snapshot_id uuid
    REFERENCES public.classic_league_round_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_source text NOT NULL DEFAULT 'legacy_manual',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.league_closed_periods'::regclass
      AND conname = 'league_closed_periods_round_bounds_check'
  ) THEN
    ALTER TABLE public.league_closed_periods
      ADD CONSTRAINT league_closed_periods_round_bounds_check
      CHECK (
        (baseline_round IS NULL OR baseline_round BETWEEN 0 AND 37)
        AND (final_round IS NULL OR final_round BETWEEN 1 AND 38)
        AND (
          baseline_round IS NULL OR final_round IS NULL
          OR baseline_round < final_round
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.league_closed_periods'::regclass
      AND conname = 'league_closed_periods_closure_source_check'
  ) THEN
    ALTER TABLE public.league_closed_periods
      ADD CONSTRAINT league_closed_periods_closure_source_check
      CHECK (closure_source IN ('legacy_manual', 'api_auto', 'manual_override'));
  END IF;
END $$;

-- As rodadas históricas finais ainda precisam ser confirmadas pelo administrador.
-- Não preencher baseline_round/final_round com estimativas ou datas de fechamento.
-- Os dados históricos serão registrados em uma migration separada após confirmação.
