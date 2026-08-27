import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';
import type { MatchInput } from '../../standings/types.ts';
import type { NormalizedTournamentData } from '../../cache/payload.ts';

export interface NormalizedResult extends NormalizedTournamentData {
  matches: MatchInput[];
}

/**
 * Normalizador genérico e multi-fonte: combina a saída de N adapters
 * por precedência (o primeiro da lista vence em caso de conflito).
 */
export function normalizeTournamentData(
  adapters: TournamentAdapter[],
  raws: unknown[],
  ctx: AdapterContext,
): NormalizedResult {
  const result: NormalizedResult = {
    fases: {},
    classificacao: { grupos: {} },
    dados_externos: { rows: [] },
    matches: [],
  };

  // Aplicado em ordem inversa para que o adapter de maior precedência sobrescreva.
  for (let i = adapters.length - 1; i >= 0; i--) {
    const adapter = adapters[i] as TournamentAdapter<any>;
    const raw = raws[i];
    const fases = adapter.toFases?.(raw, ctx);
    if (fases) result.fases = { ...result.fases, ...fases };
    const classificacao = adapter.toClassificacao?.(raw, ctx);
    if (classificacao?.grupos && Object.keys(classificacao.grupos).length) {
      result.classificacao = { grupos: { ...result.classificacao.grupos, ...classificacao.grupos } };
    }
    const dados = adapter.toDadosExternos?.(raw, ctx);
    if (dados?.rows?.length) result.dados_externos = dados;
    const matches = adapter.toMatches?.(raw, ctx);
    if (matches?.length) result.matches = matches;
  }

  return result;
}
