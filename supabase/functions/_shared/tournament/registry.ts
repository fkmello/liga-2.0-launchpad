import type { TournamentAdapter, TournamentDefinition } from './types.ts';
import { cartolaCopaAdapter } from '../providers/cartola-copa/adapter.ts';
import { cartolaBrasileiraoAdapter } from '../providers/cartola-brasileirao/adapter.ts';
import { cartolaBrasileiraoSerieBAdapter } from '../providers/cartola-brasileirao/adapter-serie-b.ts';

/**
 * Registry = única fonte de verdade. Nenhum cache_key, season, version ou
 * schema_version pode ser hardcoded fora daqui.
 */
const DEFINITIONS: Record<string, TournamentDefinition> = {
  copa_mundo: {
    league: 'copa_mundo',
    currentSeason: 2026,
    // Fonte de dados do novo pipeline (planilha segue oficial via sync-sheets).
    activeSync: 'api',
    persistMode: 'shadow',
    cacheKey: (season) => (season === 2026 ? 'copa_mundo' : `copa_mundo:${season}`),
    cacheType: 'copa_mundo',
    version: 1,
    schema_version: 1,
    standingsPreset: 'FIFA',
    mergeableKeys: ['fases.fase_grupos'],
    adapters: [cartolaCopaAdapter],
    adapterPrecedence: { cartola_copa_v1: 10 },
    cron: {
      enabled: true,
      statusProvider: 'cartola_copa',
      firstSyncDelayMinutes: 15,
      firstSyncWindowMinutes: 30,
      secondSyncDelayMinutes: 60,
    },
  },
  brasileirao_serie_a: {
    league: 'brasileirao_serie_a',
    currentSeason: 2026,
    activeSync: 'api',
    // Shadow mode: escrita restrita a shadow/{league}/{season}.
    persistMode: 'shadow',
    cacheKey: (season) => `brasileirao_serie_a:${season}`,
    cacheType: 'brasileirao_serie_a',
    version: 1,
    schema_version: 1,
    standingsPreset: 'CBF',
    mergeableKeys: [],
    adapters: [cartolaBrasileiraoAdapter],
    adapterPrecedence: { cartola_brasileirao_serie_a_v1: 10 },
    cron: {
      enabled: true,
      statusProvider: 'cartola',
      firstSyncDelayMinutes: 15,
      firstSyncWindowMinutes: 30,
      secondSyncDelayMinutes: 60,
    },
  },
  brasileirao_serie_b: {
    league: 'brasileirao_serie_b',
    currentSeason: 2026,
    activeSync: 'api',
    persistMode: 'shadow',
    cacheKey: (season) => `brasileirao_serie_b:${season}`,
    cacheType: 'brasileirao_serie_b',
    version: 1,
    schema_version: 1,
    standingsPreset: 'CBF',
    mergeableKeys: [],
    adapters: [cartolaBrasileiraoSerieBAdapter],
    adapterPrecedence: { cartola_brasileirao_serie_b_v1: 10 },
    cron: {
      enabled: false,
      statusProvider: 'cartola',
      firstSyncDelayMinutes: 15,
      firstSyncWindowMinutes: 30,
      secondSyncDelayMinutes: 60,
    },
  },

};


export function resolveDefinition(league: string, season?: number): {
  def: TournamentDefinition;
  season: number;
} {
  const def = DEFINITIONS[league];
  if (!def) throw new Error(`Torneio não registrado: ${league}`);
  return { def, season: season ?? def.currentSeason };
}

export function listTournaments(): string[] {
  return Object.keys(DEFINITIONS);
}

/**
 * Seleção de adapters governada pela feature flag `activeSync`.
 * Migrar um torneio da planilha para API = alterar uma linha no registry.
 */
export function selectAdapters(def: TournamentDefinition): TournamentAdapter[] {
  const byPrecedence = (a: TournamentAdapter, b: TournamentAdapter) =>
    (def.adapterPrecedence?.[b.id] ?? 0) - (def.adapterPrecedence?.[a.id] ?? 0);

  if (def.activeSync === 'api') {
    return def.adapters.filter((a) => a.source_type === 'api').sort(byPrecedence);
  }
  if (def.activeSync === 'sheet') {
    return def.adapters.filter((a) => a.source_type === 'sheet').sort(byPrecedence);
  }
  return [...def.adapters].sort(byPrecedence);
}
