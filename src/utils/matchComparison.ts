export interface NormalizedPlayer {
  id: number;
  nome: string;
  foto: string;
  posicao_id: number;
  pontuacao: number;
  pontuacao_base?: number;
  variacao: number;
  clube_id?: number;
  clube_escudo?: string;
  preco_num?: number;
  is_capitao?: boolean;
  is_reserva_luxo?: boolean;
  game_status?: 'not_started' | 'played' | 'not_played';
  is_subbed_in?: boolean;
  is_subbed_out?: boolean;
}

/**
 * Determines if a match card can be compared based on market rules.
 * - Market open (1): any previous round (rodadaDoCard < rodadaBase)
 * - Market closed (2): only current round (rodadaDoCard === rodadaBase)
 * - Future rounds: never
 */
export function canCompare(
  rodadaDoCard: number,
  rodadaBase: number,
  statusMercado: number
): boolean {
  if (rodadaDoCard > rodadaBase) return false;
  if (statusMercado === 1) return rodadaDoCard < rodadaBase;
  if (statusMercado === 2) return rodadaDoCard === rodadaBase;
  return false;
}

/**
 * Position ordering for player display.
 * GOL=1, LAT=2, ZAG=3, MEI=4, ATA=5, TEC=6
 */
export const POSITION_ORDER = [1, 2, 3, 4, 5, 6];

export const POSITION_LABELS: Record<number, string> = {
  1: 'GOL',
  2: 'LAT',
  3: 'ZAG',
  4: 'MEI',
  5: 'ATA',
  6: 'TEC',
};

/**
 * Groups players by position in the fixed order.
 */
export function groupByPosition(players: NormalizedPlayer[]): Map<number, NormalizedPlayer[]> {
  const map = new Map<number, NormalizedPlayer[]>();
  for (const posId of POSITION_ORDER) {
    map.set(posId, []);
  }
  for (const p of players) {
    const arr = map.get(p.posicao_id);
    if (arr) arr.push(p);
  }
  // Sort each group alphabetically so shared players align on the same row
  for (const posId of POSITION_ORDER) {
    map.get(posId)!.sort((a, b) => a.nome.localeCompare(b.nome));
  }
  return map;
}

/**
 * Sorts reserve players by position order (GOL, LAT, ZAG, MEI, ATA).
 */
export function sortReservesByPosition(players: NormalizedPlayer[]): NormalizedPlayer[] {
  return [...players].sort((a, b) => a.posicao_id - b.posicao_id);
}

/**
 * Builds a Set of shared player IDs between two teams for O(1) highlight lookup.
 */
export function getSharedPlayerIds(
  team1Players: NormalizedPlayer[],
  team2Players: NormalizedPlayer[]
): Set<number> {
  const ids1 = new Set(team1Players.map(p => p.id));
  const shared = new Set<number>();
  for (const p of team2Players) {
    if (ids1.has(p.id)) shared.add(p.id);
  }
  return shared;
}

/**
 * Builds a teamName -> idCartola mapping from dados externos rows.
 * col 0 = team_name, col 1 = id_cartola
 */
/**
 * Aligns two player arrays so shared players (same id) appear on the same row.
 * Shared players come first (sorted alphabetically), then exclusives side by side.
 */
export function alignPlayersByPosition(
  t1: NormalizedPlayer[],
  t2: NormalizedPlayer[]
): { left: (NormalizedPlayer | null)[]; right: (NormalizedPlayer | null)[] } {
  const t2Ids = new Set(t2.map(p => p.id));
  const t1Ids = new Set(t1.map(p => p.id));

  const sharedFromT1 = t1.filter(p => t2Ids.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  const t1Only = t1.filter(p => !t2Ids.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  const t2Only = t2.filter(p => !t1Ids.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome));

  const t2ById = new Map(t2.map(p => [p.id, p]));

  const left: (NormalizedPlayer | null)[] = [];
  const right: (NormalizedPlayer | null)[] = [];

  // Shared players first
  for (const p of sharedFromT1) {
    left.push(p);
    right.push(t2ById.get(p.id)!);
  }

  // Exclusive players side by side
  const maxExcl = Math.max(t1Only.length, t2Only.length);
  for (let i = 0; i < maxExcl; i++) {
    left.push(t1Only[i] ?? null);
    right.push(t2Only[i] ?? null);
  }

  return { left, right };
}

/**
 * Allowed Cartola rounds for Libertadores/Sulamericana phases.
 * Cards are only clickable when market is closed (status 2) AND current round matches.
 */
export const CONTINENTAL_ALLOWED_ROUNDS: Record<number | string, number[]> = {
  1: [11],
  2: [12],
  3: [14],
  4: [15],
  5: [17],
  6: [18],
  'Oitavas de Final': [23, 24],
  'Quartas de Final': [27, 28],
  'Semifinal': [31, 32],
  'Final': [37],
};

export function canCompareContinental(
  faseOuRodada: number | string,
  rodadaBase: number,
  statusMercado: number
): boolean {
  if (statusMercado !== 2) return false;
  const allowed = CONTINENTAL_ALLOWED_ROUNDS[faseOuRodada];
  return allowed ? allowed.includes(rodadaBase) : false;
}

/**
 * Champions League — regras de comparação:
 * - Placar definido (jogo concluído)
 * - statusMercado === 2 (fechado)
 * - Se a partida tiver `rodada` (Fase de Liga), valida contra a rodada atual.
 *   Mata-mata sem `rodada` → libera apenas com placar + mercado fechado.
 */
export function canCompareChampions(
  match: {
    placar1?: string | number | null;
    placar2?: string | number | null;
    rodada?: number;
  },
  rodadaAtual: number,
  statusMercado: number,
): boolean {
  const isFilled = (v: unknown) =>
    v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-';
  const hasResult = isFilled(match?.placar1) && isFilled(match?.placar2);
  const isCurrentRound =
    match?.rodada !== undefined ? match.rodada === rodadaAtual : true;
  return hasResult && statusMercado === 2 && isCurrentRound;
}

export function buildTeamIdMap(rows: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const name = row[0]?.trim();
    const id = row[1]?.trim();
    if (name && id) {
      map.set(name.toUpperCase(), id);
    }
  }
  return map;
}
