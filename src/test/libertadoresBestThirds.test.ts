import { describe, expect, it } from 'vitest';
import { resolveLibertadoresBestThirds } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';

function row(team: string, points: number, wins: number, goalDiff: number, goalsFor: number) {
  return ['', '', team, String(points), '6', String(wins), '0', '0', String(goalsFor), String(goalDiff)];
}

describe('Libertadores best third-place qualifiers', () => {
  it('orders third-place teams using points, wins, goal difference, then points scored', () => {
    const grupos: Record<string, unknown[]> = {};
    for (let i = 0; i < 8; i++) {
      const group = `GRUPO ${String.fromCharCode(65 + i)}`;
      grupos[group] = [
        row(`Primeiro ${i}`, 30, 6, 20, 100),
        row(`Segundo ${i}`, 20, 4, 5, 80),
        row(`Terceiro ${i}`, i === 7 ? 10 : 8 + i, i === 7 ? 3 : i, i, 50 + i),
        row(`Quarto ${i}`, 0, 0, -20, 10),
      ];
    }

    const result = resolveLibertadoresBestThirds({ grupos });
    expect(result).toHaveLength(2);
    expect(result?.map(team => team.team)).toEqual(['Terceiro 6', 'Terceiro 5']);
  });

  it('requires a manual global order when third-place candidates are tied on every criterion', () => {
    const grupos: Record<string, unknown[]> = {};
    for (let i = 0; i < 8; i++) {
      const group = `GRUPO ${String.fromCharCode(65 + i)}`;
      grupos[group] = [
        row(`Primeiro ${i}`, 18, 6, 20, 100),
        row(`Segundo ${i}`, 12, 4, 5, 80),
        row(`Terceiro ${i}`, 8, 2, 0, 50),
        row(`Quarto ${i}`, 0, 0, -20, 10),
      ];
    }
    expect(resolveLibertadoresBestThirds({ grupos })).toBeNull();
    const result = resolveLibertadoresBestThirds({
      grupos,
      desempatesManuais: { global: ['Terceiro 0', 'Terceiro 1'] },
    });
    expect(result).toBeNull();
  });

  it('does not select a third place if a group has fewer than four teams', () => {
    expect(resolveLibertadoresBestThirds({ grupos: { 'GRUPO A': [row('A', 18, 6, 20, 100), row('B', 12, 4, 5, 80), row('C', 8, 2, 0, 50)] } })).toBeNull();
  });
});
