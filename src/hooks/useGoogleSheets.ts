import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchFromCache, fetchWithFallback } from '@/lib/sheetsCache';
import { isConsolidatedTournament, useTournamentPayload } from '@/hooks/useTournamentPayload';
import type { StandingRow } from '@/types/tournament';
import { USE_COPA_BRASIL_SHADOW_READ } from '@/config/featureFlags';
import { getCopaBrasilShadowPhase, getCopaBrasilShadowRows } from '@/lib/copaBrasilShadow';


export interface Confronto {
  team1: string;
  team2: string;
  score1?: string;
  score2?: string;
  matchOrder: number;
  idCartola1?: string;
  idCartola2?: string;
  /**
   * Identificador opcional de torneio (naming oficial: `serie_a`, `copa_brasil`,
   * `libertadores`, `campeoes`, `copa_mundo`, etc.). Quando presente, prevalece
   * sobre o `league` derivado do componente para resolver o endpoint Cartola.
   */
  league?: string;
}

export interface ConfrontosData {
  tournament: string;
  round: string;
  matches: Confronto[];
}

export interface DadosExternosData {
  headers: string[];
  rows: string[][];
  raw: string[][];
}

export interface ClassificacaoData {
  data: string[][];
}

export interface LibertadoresGroupData {
  groups: Array<{
    name: string;
    headers: string[];
    rows: string[][];
  }>;
}

export interface ConfrontoCopa {
  team1: string;
  team2: string;
  scoreIda1: string;
  scoreVolta1: string;
  scoreIda2: string;
  scoreVolta2: string;
  matchNumber: string;
  idCartola1?: string;
  idCartola2?: string;
  /** Identificador opcional de torneio (ver Confronto.league). */
  league?: string;
}

export interface PodiumEntry {
  position: number;
  badge: string;
  team: string;
}

export interface ConfrontosCopaData {
  fase: string;
  rodadaInfo: string;
  matches: ConfrontoCopa[];
  isFinal?: boolean;
  podium?: PodiumEntry[];
}

export interface LibertadoresGroupMatchesData {
  tournament: string;
  round: string;
  groups: Array<{
    name: string;
    matches: Confronto[];
  }>;
}

export interface RankingLigaEntry {
  position: string;
  badge: string;
  teamName: string;
  total: string;
}

export interface RankingLigaData {
  title: string;
  rankings: RankingLigaEntry[];
}

/**
 * Seletor sobre o contrato normalizado quando o torneio já está migrado;
 * caso contrário mantém exatamente o fluxo legado de hoje.
 */
export function useConfrontos(rodada: number, league: string = 'serie_a') {
  const consolidated = isConsolidatedTournament(league);
  const normalized = useTournamentPayload(league);

  const legacy = useQuery<ConfrontosData>({
    queryKey: ['confrontos', league, rodada],
    queryFn: () => fetchWithFallback<ConfrontosData>(
      `resultados:${league}:${rodada}`,
      { action: 'confrontos', rodada: rodada.toString(), league }
    ),
    staleTime: 5 * 60 * 1000,
    enabled: !consolidated && rodada >= 1 && rodada <= 38,
  });

  if (!consolidated) {
    return { data: legacy.data, isLoading: legacy.isLoading, error: legacy.error };
  }

  return {
    data: normalized.data?.matchesByRound[rodada] as ConfrontosData | undefined,
    isLoading: normalized.isLoading,
    error: normalized.error,
  };
}

export function useDadosExternos(league: string = 'serie_a') {
  const consolidated = isConsolidatedTournament(league);
  const normalized = useTournamentPayload(league);

  const legacy = useQuery<DadosExternosData>({
    queryKey: ['dados-externos', league],
    queryFn: () => fetchWithFallback<DadosExternosData>(
      `dados_externos:${league}`,
      { action: 'dados_externos', league }
    ),
    staleTime: 30 * 60 * 1000,
    enabled: !consolidated,
  });

  if (!consolidated) {
    return { data: legacy.data, isLoading: legacy.isLoading, error: legacy.error };
  }

  const rows = normalized.data?.externalRows;
  return {
    data: rows ? ({ headers: [], rows, raw: rows } as DadosExternosData) : undefined,
    isLoading: normalized.isLoading,
    error: normalized.error,
  };
}


export function useDadosExternosLiga() {
  return useQuery<DadosExternosData | null>({
    queryKey: ['dados-externos-liga-classica'],
    queryFn: () => fetchFromCache<DadosExternosData>('dados_externos:liga_classica'),
    staleTime: 30 * 60 * 1000,
  });
}


export interface ClassificacaoResult {
  /** Contrato normalizado — presente apenas para torneios migrados. */
  standings: StandingRow[] | null;
  /** Contrato legado (matriz da planilha) — demais torneios. */
  legacy: ClassificacaoData | null;
  isLoading: boolean;
  error: Error | null;
}

export function useClassificacao(league: string = 'serie_a'): ClassificacaoResult {
  const consolidated = isConsolidatedTournament(league);
  const normalized = useTournamentPayload(league);

  const legacy = useQuery<ClassificacaoData>({
    queryKey: ['classificacao', league],
    queryFn: () => fetchWithFallback<ClassificacaoData>(
      `classificacao:${league}`,
      { action: 'classificacao', league }
    ),
    staleTime: 5 * 60 * 1000,
    enabled: !consolidated,
  });

  if (!consolidated) {
    return {
      standings: null,
      legacy: legacy.data ?? null,
      isLoading: legacy.isLoading,
      error: legacy.error,
    };
  }

  return {
    standings: normalized.data?.standings ?? null,
    legacy: null,
    isLoading: normalized.isLoading,
    error: normalized.error,
  };
}


export function useBaseDadosCopa(fase: string = '1ª Fase') {
  return useQuery<DadosExternosData>({
    queryKey: ['base-dados-copa', fase, USE_COPA_BRASIL_SHADOW_READ],
    queryFn: async () => {
      if (USE_COPA_BRASIL_SHADOW_READ) {
        const shadow = await fetchFromCache<unknown>(`shadow/copa_brasil/${new Date().getFullYear()}`);
        const rows = getCopaBrasilShadowRows(shadow);
        if (rows) {
          // Preserve the existing component contract while reading normalized API rows.
          return { headers: [], rows, raw: rows };
        }
      }
      return fetchWithFallback<DadosExternosData>(
        'copa:brasil',
        { action: 'base_dados_copa', fase },
        (d) => d?.dados_externos
      );
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useConfrontosCopa(fase: string) {
  return useQuery<ConfrontosCopaData>({
    queryKey: ['confrontos-copa', fase, USE_COPA_BRASIL_SHADOW_READ],
    queryFn: async () => {
      if (USE_COPA_BRASIL_SHADOW_READ) {
        const shadow = await fetchFromCache<unknown>(`shadow/copa_brasil/${new Date().getFullYear()}`);
        const phase = getCopaBrasilShadowPhase(shadow, fase);
        if (phase) return phase as unknown as ConfrontosCopaData;
      }
      return fetchWithFallback<ConfrontosCopaData>(
        'copa:brasil',
        { action: 'confrontos_copa', fase },
        (d) => d?.fases?.[fase]
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosLibertadoresGrupos(rodada: number) {
  return useQuery<LibertadoresGroupMatchesData>({
    queryKey: ['confrontos-libertadores-grupos', rodada],
    queryFn: () => fetchWithFallback<LibertadoresGroupMatchesData>(
      'libertadores',
      { action: 'confrontos_libertadores_grupos', rodada: rodada.toString() },
      (d) => d?.grupos?.[`rodada_${rodada}`]
    ),
    staleTime: 5 * 60 * 1000,
    enabled: rodada >= 1 && rodada <= 6,
  });
}

export function useDadosExternosLibertadores() {
  return useQuery<DadosExternosData>({
    queryKey: ['dados-externos-libertadores'],
    queryFn: () => fetchWithFallback<DadosExternosData>(
      'libertadores',
      { action: 'dados_externos_libertadores' },
      (d) => d?.dados_externos
    ),
    staleTime: 30 * 60 * 1000,
  });
}

export function useClassificacaoLibertadores() {
  return useQuery<LibertadoresGroupData>({
    queryKey: ['classificacao-libertadores'],
    queryFn: () => fetchWithFallback<LibertadoresGroupData>(
      'libertadores',
      { action: 'classificacao_libertadores' },
      (d) => d?.classificacao
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosLibertadores(fase: string) {
  return useQuery<ConfrontosCopaData>({
    queryKey: ['confrontos-libertadores', fase],
    queryFn: () => fetchWithFallback<ConfrontosCopaData>(
      'libertadores',
      { action: 'confrontos_libertadores', fase },
      (d) => d?.fases?.[fase]
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosSulamericanaGrupos(rodada: number) {
  return useQuery<LibertadoresGroupMatchesData>({
    queryKey: ['confrontos-sulamericana-grupos', rodada],
    queryFn: () => fetchWithFallback<LibertadoresGroupMatchesData>(
      'sulamericana',
      { action: 'confrontos_sulamericana_grupos', rodada: rodada.toString() },
      (d) => d?.grupos?.[`rodada_${rodada}`]
    ),
    staleTime: 5 * 60 * 1000,
    enabled: rodada >= 1 && rodada <= 6,
  });
}

export function useDadosExternosSulamericana() {
  return useQuery<DadosExternosData>({
    queryKey: ['dados-externos-sulamericana'],
    queryFn: () => fetchWithFallback<DadosExternosData>(
      'sulamericana',
      { action: 'dados_externos_sulamericana' },
      (d) => d?.dados_externos
    ),
    staleTime: 30 * 60 * 1000,
  });
}

export function useClassificacaoSulamericana() {
  return useQuery<LibertadoresGroupData>({
    queryKey: ['classificacao-sulamericana'],
    queryFn: () => fetchWithFallback<LibertadoresGroupData>(
      'sulamericana',
      { action: 'classificacao_sulamericana' },
      (d) => d?.classificacao
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosSulamericana(fase: string) {
  return useQuery<ConfrontosCopaData>({
    queryKey: ['confrontos-sulamericana', fase],
    queryFn: () => fetchWithFallback<ConfrontosCopaData>(
      'sulamericana',
      { action: 'confrontos_sulamericana', fase },
      (d) => d?.fases?.[fase]
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDadosExternosIntercontinental() {
  return useQuery<DadosExternosData>({
    queryKey: ['dados-externos-intercontinental'],
    queryFn: () => fetchWithFallback<DadosExternosData>(
      'intercontinental',
      { action: 'dados_externos_intercontinental' },
      (d) => d?.dados_externos
    ),
    staleTime: 30 * 60 * 1000,
  });
}

export function useConfrontosIntercontinental(fase: string) {
  return useQuery<ConfrontosCopaData>({
    queryKey: ['confrontos-intercontinental', fase],
    queryFn: () => fetchWithFallback<ConfrontosCopaData>(
      'intercontinental',
      { action: 'confrontos_intercontinental', fase },
      (d) => d?.fases?.[fase]
    ),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Champions League (campeoes) ─────────────────────────────────────────────

export interface ChampionsClassificacaoRow {
  position: string;
  badge: string;
  name: string;
  points: string;
  games: string;
  wins: string;
  draws: string;
  losses: string;
  gp: string;
  gc: string;
  sg: string;
}

export interface ChampionsClassificacaoData {
  rows: ChampionsClassificacaoRow[];
}

export interface ChampionsKnockoutMatch extends ConfrontoCopa {
  tipo?: 'final' | 'terceiro_lugar' | string;
}

export interface ChampionsKnockoutData {
  fase: string;
  rodadaInfo?: string;
  matches: ChampionsKnockoutMatch[];
  isFinal?: boolean;
}

export function useDadosExternosCampeoes() {
  return useQuery<DadosExternosData>({
    queryKey: ['dados-externos-campeoes'],
    queryFn: () => fetchWithFallback<DadosExternosData>(
      'campeoes',
      { action: 'dados_externos_campeoes' },
      (d) => d?.dados_externos
    ),
    staleTime: 30 * 60 * 1000,
  });
}

export function useClassificacaoCampeoes() {
  return useQuery<ChampionsClassificacaoData>({
    queryKey: ['classificacao-campeoes'],
    queryFn: () => fetchWithFallback<ChampionsClassificacaoData>(
      'campeoes',
      { action: 'classificacao_campeoes' },
      (d) => d?.classificacao
    ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosCampeoesFaseLiga(rodada: number) {
  return useQuery<ConfrontosData>({
    queryKey: ['confrontos-campeoes-fase-liga', rodada],
    queryFn: () => fetchWithFallback<ConfrontosData>(
      'campeoes',
      { action: 'confrontos_campeoes_fase_liga', rodada: rodada.toString() },
      (d) => d?.fases?.['Fase de Liga']?.[`rodada_${rodada}`]
    ),
    staleTime: 5 * 60 * 1000,
    enabled: rodada >= 1 && rodada <= 8,
  });
}

export function useConfrontosCampeoes(fase: string) {
  return useQuery<ChampionsKnockoutData>({
    queryKey: ['confrontos-campeoes', fase],
    queryFn: () => fetchWithFallback<ChampionsKnockoutData>(
      'campeoes',
      { action: 'confrontos_campeoes', fase },
      (d) => d?.fases?.[fase]
    ),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Copa do Mundo FIFA (copa_mundo) ──────────────────────────────────────────

import {
  COPA_MUNDO_CACHE_VERSION,
  type CopaMundoPhase,
} from '@/config/copaMundoPhases';

export interface CopaMundoClassificacaoRow {
  posicao: number;
  team_name: string;
  pontos: string;
  jogos: string;
  vitorias: string;
  empates: string;
  derrotas: string;
  gols_pro?: string;
  saldo: string;
}

export interface CopaMundoClassificacaoData {
  grupos: Record<string, CopaMundoClassificacaoRow[]>;
}

export interface CopaMundoDadosExternosRow {
  team_name: string;
  id_cartola: string;
  logo_url: string;
}

export interface CopaMundoDadosExternosData {
  rows: CopaMundoDadosExternosRow[];
}

export interface CopaMundoFaseGruposRodadaData {
  tournament: string;
  round: string;
  groups: Record<string, { matches: Confronto[] }>;
}

export interface CopaMundoMatch extends ConfrontoCopa {
  tipo?: 'mata_mata' | 'final' | 'terceiro_lugar';
}

export interface CopaMundoFaseData {
  fase: string;
  matches: CopaMundoMatch[];
  isFinal?: boolean;
}

/**
 * Lê do cache `copa_mundo`. Valida `version === COPA_MUNDO_CACHE_VERSION` antes
 * de extrair — versão incompatível retorna null para que a view exiba empty state.
 */
async function fetchCopaMundoCache<T>(extractor: (data: any) => T | undefined | null): Promise<T | null> {
  const { data: row } = await supabase
    .from('sheets_cache')
    .select('data')
    .eq('cache_key', 'copa_mundo')
    .maybeSingle();
  const payload = row?.data as any;
  if (!payload) return null;
  if (payload.version !== COPA_MUNDO_CACHE_VERSION) {
    console.warn('[copa_mundo] cache version inválida', { version: payload?.version });
    return null;
  }
  const result = extractor(payload);
  return result ?? null;
}

export function useDadosExternosCopaMundo() {
  return useQuery<CopaMundoDadosExternosData | null>({
    queryKey: ['copa-mundo', 'dados-externos'],
    queryFn: () => fetchCopaMundoCache<CopaMundoDadosExternosData>((d) => d?.dados_externos),
    staleTime: 30 * 60 * 1000,
  });
}

export function useClassificacaoCopaMundo() {
  return useQuery<CopaMundoClassificacaoData | null>({
    queryKey: ['copa-mundo', 'classificacao'],
    queryFn: () => fetchCopaMundoCache<CopaMundoClassificacaoData>((d) => d?.classificacao),
    staleTime: 5 * 60 * 1000,
  });
}

export function useConfrontosCopaMundoFaseGrupos(rodada: number) {
  return useQuery<CopaMundoFaseGruposRodadaData | null>({
    queryKey: ['copa-mundo', 'fase-grupos', rodada],
    queryFn: () => fetchCopaMundoCache<CopaMundoFaseGruposRodadaData>((d) => d?.fases?.fase_grupos?.[`rodada_${rodada}`]),
    staleTime: 5 * 60 * 1000,
    enabled: rodada >= 1 && rodada <= 3,
  });
}

export function useConfrontosCopaMundo(phaseKey: Exclude<CopaMundoPhase, 'fase_grupos'>) {
  return useQuery<CopaMundoFaseData | null>({
    queryKey: ['copa-mundo', 'ko', phaseKey],
    queryFn: () => fetchCopaMundoCache<CopaMundoFaseData>((d) => d?.fases?.[phaseKey]),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCopaMundoData() {
  return useQuery<any | null>({
    queryKey: ['copa-mundo', 'all'],
    queryFn: () => fetchCopaMundoCache<any>((d) => d),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Liga Clássica ranking ─────────────────────────────────────────────────────

export function fetchRankingLiga(periodo: string): Promise<RankingLigaData> {
  return fetchWithFallback<RankingLigaData>(
    `ranking_liga:${periodo}`,
    { action: 'ranking_liga', periodo }
  );
}

export function useRankingLiga(periodo: string) {
  return useQuery<RankingLigaData>({
    queryKey: ['ranking-liga', periodo],
    queryFn: () => fetchRankingLiga(periodo),
    staleTime: 30 * 60 * 1000,
  });
}
