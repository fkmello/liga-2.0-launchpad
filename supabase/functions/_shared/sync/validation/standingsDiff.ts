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


interface LibertadoresClassificationRow {
  name: string;
  points: number | null;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goalsFor: number | null;
  goalDiff: number | null;
}

/** Parses both the old 9-column and new 10-column Libertadores row formats. */
function parseLibertadoresClassificationRow(row: unknown): LibertadoresClassificationRow | null {
  if (!Array.isArray(row) || row.length < 9) return null;
  const name = String(row[2] ?? '').trim();
  if (!normalizeName(name)) return null;
  const isNewFormat = row.length >= 10;
  return {
    name,
    points: toNum(row[3]),
    played: toNum(row[4]),
    wins: toNum(row[5]),
    draws: toNum(row[6]),
    losses: toNum(row[7]),
    goalsFor: isNewFormat ? toNum(row[8]) : null,
    goalDiff: toNum(row[isNewFormat ? 9 : 8]),
  };
}

/**
 * Compara o contrato de classificação dos torneios continentais (não os índices
 * genéricos das ligas). O cache antigo não contém pontos pró; esse campo só é
 * comparado se também existir na classificação de referência. Permite ignorar
 * grupos auxiliares legados, como o grupo H na Sul-Americana.
 */
export function diffLibertadoresClassification(
  baseline: TournamentCachePayload | null,
  generatedClassification: TournamentCachePayload['classificacao'] | null | undefined,
  excludedGroups: string[] = [],
): StandingsDivergence[] {
  if (!baseline?.classificacao?.grupos || !generatedClassification?.grupos) return [];

  const excluded = new Set(excludedGroups.map(normalizeName));
  const base = new Map<string, LibertadoresClassificationRow>();
  for (const [groupName, rows] of Object.entries(baseline.classificacao.grupos)) {
    if (excluded.has(normalizeName(groupName))) continue;
    for (const raw of Array.isArray(rows) ? rows as unknown[] : []) {
      const row = parseLibertadoresClassificationRow(raw);
      if (row) base.set(normalizeName(row.name), row);
    }
  }

  const divergences: StandingsDivergence[] = [];
  const generatedNames = new Set<string>();
  for (const [groupName, rows] of Object.entries(generatedClassification.grupos)) {
    if (excluded.has(normalizeName(groupName))) continue;
    for (const raw of Array.isArray(rows) ? rows as unknown[] : []) {
      const calculated = parseLibertadoresClassificationRow(raw);
      if (!calculated) continue;
      const normalizedName = normalizeName(calculated.name);
      generatedNames.add(normalizedName);
      const previous = base.get(normalizedName);
      if (!previous) {
        divergences.push({
          equipe: calculated.name,
          campo: 'presenca',
          valor_atual: null,
          valor_calculado: 'presente apenas no cálculo',
        });
        continue;
      }
      const fields: Array<[keyof LibertadoresClassificationRow, string]> = [
        ['points', 'pontos'],
        ['played', 'jogos'],
        ['wins', 'vitorias'],
        ['draws', 'empates'],
        ['losses', 'derrotas'],
        ['goalDiff', 'saldo'],
      ];
      if (previous.goalsFor !== null) fields.push(['goalsFor', 'pontos_pro']);
      for (const [key, label] of fields) {
        const before = previous[key];
        const after = calculated[key];
        if (typeof before !== 'number' || typeof after !== 'number') continue;
        if (Math.abs(before - after) > 0.005) {
          divergences.push({
            equipe: calculated.name,
            campo: label,
            valor_atual: before,
            valor_calculado: after,
          });
        }
      }
    }
  }

  for (const [normalizedName, previous] of base) {
    if (!generatedNames.has(normalizedName)) {
      divergences.push({
        equipe: previous.name,
        campo: 'presenca',
        valor_atual: 'presente no cache',
        valor_calculado: null,
      });
    }
  }

  return divergences;
}
