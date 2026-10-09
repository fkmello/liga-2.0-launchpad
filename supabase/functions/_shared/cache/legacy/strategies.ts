import { isLegacyStandingsTeamRow } from './columns.ts';
import type { TournamentCachePayload } from '../../tournament/types.ts';

export interface LegacyReadContext {
  league: string;
  season: number | string;
  /** Lê o valor bruto de uma chave do cache legado. */
  read: (cacheKey: string) => Promise<any | null>;
}

export interface LegacyStrategy {
  id: string;
  read(ctx: LegacyReadContext): Promise<TournamentCachePayload | null>;
}

const EMPTY_PAYLOAD = (): TournamentCachePayload => ({
  version: 0,
  synced_at: '',
  fases: {},
  classificacao: { grupos: {} },
  dados_externos: { rows: [] },
});

/**
 * Formato legado "consolidado": uma única chave já contém
 * { fases, classificacao, dados_externos }. Ex.: copa_mundo, champions.
 */
export function singleKeyStrategy(cacheKey: (ctx: LegacyReadContext) => string): LegacyStrategy {
  return {
    id: 'single-key',
    async read(ctx) {
      const data = await ctx.read(cacheKey(ctx));
      if (!data) return null;
      return {
        version: data.version ?? 0,
        synced_at: data.synced_at ?? '',
        fases: data.fases ?? {},
        classificacao: data.classificacao ?? { grupos: {} },
        dados_externos: data.dados_externos ?? { rows: [] },
        metadata: data.metadata,
      };
    },
  };
}

/**
 * Formato legado "multi-chave" das ligas por pontos corridos (Série A/B/C):
 *   classificacao:{liga}
 *   dados_externos:{liga}
 *   resultados:{liga}:{rodada}
 */
export function multiKeyLeagueStrategy(opts: {
  legacyLeague: string;
  maxRodada: number;
}): LegacyStrategy {
  return {
    id: 'multi-key-league',
    async read(ctx) {
      const { legacyLeague, maxRodada } = opts;
      const payload = EMPTY_PAYLOAD();
      let found = false;

      const classRaw = await ctx.read(`classificacao:${legacyLeague}`);
      if (classRaw) {
        found = true;
        payload.classificacao = { grupos: { geral: parseClassificacaoMatrix(classRaw) } };
      }

      const extRaw = await ctx.read(`dados_externos:${legacyLeague}`);
      if (extRaw) {
        found = true;
        payload.dados_externos = { rows: Array.isArray(extRaw.rows) ? extRaw.rows : [] };
      }

      for (let r = 1; r <= maxRodada; r++) {
        const res = await ctx.read(`resultados:${legacyLeague}:${r}`);
        if (!res) continue;
        found = true;
        payload.fases[`rodada_${r}`] = {
          tournament: res.tournament ?? '',
          round: res.round ?? String(r),
          matches: Array.isArray(res.matches) ? res.matches : [],
        };
      }

      return found ? payload : null;
    },
  };
}

/** Classificação legada vem como matriz crua da planilha: { data: [[...]] }. */
function parseClassificacaoMatrix(raw: any): unknown[] {
  const values: any[][] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  if (!values.length) return [];
  // Mantém apenas linhas de equipe (nome + pontos numéricos): descarta linhas
  // vazias, título e cabeçalho.
  return values.filter(isLegacyStandingsTeamRow);
}


/**
 * ÚNICO ponto da arquitetura que conhece formatos legados.
 * Adicionar um torneio = adicionar uma entrada aqui.
 */
export const LEGACY_STRATEGIES: Record<string, LegacyStrategy> = {
  copa_brasil: singleKeyStrategy(() => 'copa:brasil'),
  copa_mundo: singleKeyStrategy((ctx) =>
    String(ctx.season) === '2026' ? 'copa_mundo' : `copa_mundo:${ctx.season}`,
  ),
  brasileirao_serie_a: multiKeyLeagueStrategy({ legacyLeague: 'serie_a', maxRodada: 38 }),
  brasileirao_serie_b: multiKeyLeagueStrategy({ legacyLeague: 'serie_b', maxRodada: 38 }),
  brasileirao_serie_c: multiKeyLeagueStrategy({ legacyLeague: 'serie_c', maxRodada: 38 }),
  champions: singleKeyStrategy(() => 'campeoes'),
};
