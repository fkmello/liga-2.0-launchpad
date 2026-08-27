import type { StandingsOptions, TiebreakerId } from './types.ts';

export type StandingsPresetId = 'FIFA' | 'UEFA' | 'CONMEBOL' | 'CBF';

const base = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 };

export const STANDINGS_PRESETS: Record<StandingsPresetId, StandingsOptions> = {
  // Regra atual da Copa do Mundo do app: pontos → vitórias → saldo → gols pró
  FIFA: { ...base, tiebreakers: ['points', 'wins', 'goalDiff', 'goalsFor'] as TiebreakerId[], groupBy: true },
  UEFA: { ...base, tiebreakers: ['points', 'goalDiff', 'goalsFor', 'wins'], groupBy: true },
  CONMEBOL: { ...base, tiebreakers: ['points', 'goalDiff', 'goalsFor', 'wins', 'disciplinary'], groupBy: true },
  CBF: { ...base, tiebreakers: ['points', 'wins', 'goalDiff', 'goalsFor', 'disciplinary'], groupBy: true },
};

export function resolvePreset(id: StandingsPresetId): StandingsOptions {
  const preset = STANDINGS_PRESETS[id];
  if (!preset) throw new Error(`Preset de classificação desconhecido: ${id}`);
  return { ...preset, tiebreakers: [...preset.tiebreakers] };
}
