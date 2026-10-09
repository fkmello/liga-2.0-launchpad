import { describe, expect, it } from 'vitest';
import { cartolaCopaBrasilAdapter, updateCopaBrasilFases } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-copa-brasil';
import { resolveDefinition, selectAdapters } from '../../supabase/functions/_shared/tournament/registry';
import { readLegacyTournament } from '../../supabase/functions/_shared/cache/legacy/reader';
import { mergeFasesPreservingScores } from '../../supabase/functions/_shared/cache/roundPreservation';

const initialFases = {
  '1ª Fase': {
    fase: '1ª Fase',
    rodadaInfo: 'Ida - Rodada 5 | Volta - Rodada 7',
    matches: [{
      team1: 'Time A',
      team2: 'Time B',
      matchNumber: '1',
      scoreIda1: '50,00',
      scoreIda2: '40,00',
      scoreVolta1: '35,00',
      scoreVolta2: '30,00',
    }],
  },
};

const idByName = new Map([
  ['timea', '101'],
  ['timeb', '102'],
]);

describe('Copa do Brasil adapter', () => {
  it('atualiza somente a ida quando a rodada-alvo é 5', () => {
    const result = updateCopaBrasilFases(
      initialFases,
      5,
      new Map<string, number | null>([['101', 77.25], ['102', 66.5]]),
      idByName,
    );
    const match = result['1ª Fase'].matches?.[0];
    expect(match.scoreIda1).toBe('77,25');
    expect(match.scoreIda2).toBe('66,50');
    expect(match.scoreVolta1).toBe('35,00');
    expect(match.scoreVolta2).toBe('30,00');
  });

  it('mapeia todas as 11 rodadas de referência para fase e perna corretas', () => {
    const cases = [
      [5, '1ª Fase', 'scoreIda1'],
      [7, '1ª Fase', 'scoreVolta1'],
      [13, '2ª Fase', 'scoreIda1'],
      [16, '2ª Fase', 'scoreVolta1'],
      [21, 'Oitavas de Final', 'scoreIda1'],
      [22, 'Oitavas de Final', 'scoreVolta1'],
      [25, 'Quartas de Final', 'scoreIda1'],
      [26, 'Quartas de Final', 'scoreVolta1'],
      [34, 'Semifinal', 'scoreIda1'],
      [35, 'Semifinal', 'scoreVolta1'],
      [38, 'Final', 'scoreIda1'],
    ] as const;

    for (const [round, phase, scoreField] of cases) {
      const fases = {
        [phase]: {
          matches: [{ team1: 'Time A', team2: 'Time B', scoreIda1: '', scoreIda2: '', scoreVolta1: '', scoreVolta2: '' }],
        },
      };
      const result = updateCopaBrasilFases(
        fases,
        round,
        new Map<string, number | null>([['101', 71.25], ['102', 62.5]]),
        idByName,
      );
      const match = result[phase].matches?.[0];
      expect(match[scoreField]).toBe('71,25');
      const untouched = ['scoreIda1', 'scoreIda2', 'scoreVolta1', 'scoreVolta2']
        .filter((field) => field !== scoreField && field !== (scoreField === 'scoreIda1' ? 'scoreIda2' : scoreField === 'scoreVolta1' ? 'scoreVolta2' : ''));
      for (const field of untouched) {
        if (field === 'scoreIda1' || field === 'scoreIda2' || field === 'scoreVolta1' || field === 'scoreVolta2') {
          if (field !== scoreField && field !== (scoreField === 'scoreIda1' ? 'scoreIda2' : scoreField === 'scoreVolta1' ? 'scoreVolta2' : '')) {
            expect(match[field]).toBe('');
          }
        }
      }
    }
  });

  it('preserva os placares anteriores quando a API não retorna pontuação', () => {
    const result = updateCopaBrasilFases(
      initialFases,
      5,
      new Map<string, number | null>([['101', null], ['102', null]]),
      idByName,
    );
    expect(result['1ª Fase'].matches?.[0]).toEqual(initialFases['1ª Fase'].matches[0]);
  });

  it('não altera fases quando a rodada não pertence à Copa do Brasil', () => {
    expect(updateCopaBrasilFases(initialFases, 24, new Map(), idByName)).toBe(initialFases);
  });

  it('merge do shadow preserva placares de ida/volta ausentes no payload novo', () => {
    const emptyPhase = {
      ...initialFases['1ª Fase'],
      matches: [{
        ...initialFases['1ª Fase'].matches[0],
        scoreIda1: '',
        scoreIda2: '',
        scoreVolta1: '',
        scoreVolta2: '',
      }],
    };
    const merged = mergeFasesPreservingScores(
      { '1ª Fase': initialFases['1ª Fase'] },
      { '1ª Fase': emptyPhase },
    );
    expect((merged['1ª Fase'] as any).matches[0]).toEqual(initialFases['1ª Fase'].matches[0]);
  });

  it('preserva os placares do confronto correto quando a ordem muda', () => {
    const prev = {
      '1ª Fase': {
        matches: [
          { team1: 'Time A', team2: 'Time B', matchNumber: '1', scoreIda1: '70,00', scoreIda2: '60,00' },
          { team1: 'Time C', team2: 'Time D', matchNumber: '2', scoreIda1: '55,00', scoreIda2: '45,00' },
        ],
      },
    };
    const next = {
      '1ª Fase': {
        matches: [
          { team1: 'Time C', team2: 'Time D', matchNumber: '2', scoreIda1: '', scoreIda2: '' },
          { team1: 'Time A', team2: 'Time B', matchNumber: '1', scoreIda1: '', scoreIda2: '' },
        ],
      },
    };
    const merged = mergeFasesPreservingScores(prev, next);
    const matches = (merged['1ª Fase'] as any).matches;
    expect(matches[0].scoreIda1).toBe('55,00');
    expect(matches[0].scoreIda2).toBe('45,00');
    expect(matches[1].scoreIda1).toBe('70,00');
    expect(matches[1].scoreIda2).toBe('60,00');
  });

  it('não transfere placares por índice quando não existe identidade de confronto', () => {
    const prev = { fase: { matches: [{ scoreIda1: '70,00', scoreIda2: '60,00' }] } };
    const next = { fase: { matches: [{ team1: 'Time Novo', team2: 'Outro Time', scoreIda1: '', scoreIda2: '' }] } };
    const merged = mergeFasesPreservingScores(prev, next);
    expect((merged.fase as any).matches[0].scoreIda1).toBe('');
    expect((merged.fase as any).matches[0].scoreIda2).toBe('');
  });

  it('registra o torneio em shadow e mantém o cron desativado', () => {
    const { def, season } = resolveDefinition('copa_brasil');
    expect(season).toBe(2026);
    expect(def.persistMode).toBe('shadow');
    expect(def.activeSync).toBe('api');
    expect(def.cron?.enabled).toBe(false);
    expect(selectAdapters(def).map((adapter) => adapter.id)).toEqual([
      'cartola_brasileirao_copa_brasil_v1',
    ]);
    expect(cartolaCopaBrasilAdapter.id).toBe('cartola_brasileirao_copa_brasil_v1');
  });

  it('monta o baseline a partir da chave legada copa:brasil', async () => {
    const legacy = {
      fases: initialFases,
      dados_externos: { rows: [['Time A', '101', 'badge-a'], ['Time B', '102', 'badge-b']] },
    };
    const payload = await readLegacyTournament('copa_brasil', 2026, async (key) =>
      key === 'copa:brasil' ? legacy : null,
    );
    expect(payload?.fases['1ª Fase']).toEqual(initialFases['1ª Fase']);
    expect(payload?.dados_externos.rows).toHaveLength(2);
  });
});
