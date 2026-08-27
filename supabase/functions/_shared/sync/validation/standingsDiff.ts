import { LEGACY_STANDINGS_COLUMNS as C, isLegacyStandingsTeamRow } from '../../cache/legacy/columns.ts';
import type { StandingRow } from '../../standings/types.ts';
import type { TournamentCachePayload } from '../../tournament/types.ts';

export interface StandingsDivergence {
  equipe: string;
  campo: string;
  valor_atual: string | number | null;
  valor_calculado: string | number;
}

function normalizeName(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

interface BaselineRow {
  name: string;
  points: number | null;
  wins: number | null;
  goalDiff: number | null;
}

/** Baseline vem cru da planilha — extração tolerante a variações de layout. */
function parseBaseline(payload: TournamentCachePayload | null): BaselineRow[] {
  const out: BaselineRow[] = [];
  for (const rows of Object.values(payload?.classificacao?.grupos ?? {})) {
    for (const row of rows as any[]) {
      if (Array.isArray(row)) {
        if (!isLegacyStandingsTeamRow(row)) continue; // ignora cabeçalho/linhas vazias
        out.push({
          name: String(row[C.teamName] ?? '').trim(),
          points: toNum(row[C.points]),
          wins: toNum(row[C.wins]),
          goalDiff: toNum(row[C.goalDiff]),
        });

      } else if (row && typeof row === 'object') {
        const r = row as any;
        out.push({
          name: String(r.time ?? r.team ?? r.nome ?? ''),
          points: toNum(r.pontos ?? r.points ?? r.P),
          wins: toNum(r.vitorias ?? r.wins ?? r.V),
          goalDiff: toNum(r.saldo ?? r.goalDiff ?? r.SG),
        });
      }
    }
  }
  return out.filter((r) => normalizeName(r.name));
}

/**
 * Compara a classificação calculada pela StandingsEngine com a da planilha.
 * Somente auditoria — nada é alterado.
 */
export function diffStandings(
  baseline: TournamentCachePayload | null,
  standings: Record<string, StandingRow[]>,
): StandingsDivergence[] {
  const base = new Map(parseBaseline(baseline).map((r) => [normalizeName(r.name), r]));
  const divergences: StandingsDivergence[] = [];

  for (const rows of Object.values(standings)) {
    for (const row of rows) {
      const b = base.get(normalizeName(row.teamName));
      if (!b) {
        divergences.push({
          equipe: row.teamName,
          campo: 'presenca',
          valor_atual: null,
          valor_calculado: 'presente apenas no cálculo',
        });
        continue;
      }
      if (b.points !== null && Math.abs(b.points - row.points) > 0.005) {
        divergences.push({
          equipe: row.teamName,
          campo: 'pontos',
          valor_atual: b.points,
          valor_calculado: row.points,
        });
      }
      if (b.wins !== null && b.wins !== row.wins) {
        divergences.push({
          equipe: row.teamName,
          campo: 'vitorias',
          valor_atual: b.wins,
          valor_calculado: row.wins,
        });
      }
      if (b.goalDiff !== null && Math.abs(b.goalDiff - row.goalDiff) > 0.005) {
        divergences.push({
          equipe: row.teamName,
          campo: 'saldo_gols',
          valor_atual: b.goalDiff,
          valor_calculado: row.goalDiff,
        });
      }
    }
  }
  return divergences;
}
