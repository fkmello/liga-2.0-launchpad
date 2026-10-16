import { describe, expect, it } from 'vitest';
import { isMarketRoundSyncable } from '../../supabase/functions/_shared/tournament/roundEligibility';

describe('cron — elegibilidade da rodada-alvo', () => {
  it('mantém o comportamento atual quando o torneio não configura rodadas específicas', () => {
    expect(isMarketRoundSyncable(31)).toBe(true);
    expect(isMarketRoundSyncable(2)).toBe(true);
  });

  it('não sincroniza quando a rodada anterior não corresponde a uma fase mapeada', () => {
    const copaBrasil = [5, 7, 13, 16, 21, 22, 25, 26, 34, 35, 38];
    expect(isMarketRoundSyncable(31, copaBrasil)).toBe(false); // alvo 30 não mapeado
  });

  it('permite sincronizar quando a rodada anterior está mapeada', () => {
    const copaBrasil = [5, 7, 13, 16, 21, 22, 25, 26, 34, 35, 38];
    const libertadores = [11, 12, 14, 15, 17, 18, 23, 24, 27, 28, 31, 32, 37];
    expect(isMarketRoundSyncable(35, copaBrasil)).toBe(true); // alvo 34
    expect(isMarketRoundSyncable(32, libertadores)).toBe(true); // alvo 31
  });

  it('não considera rodada 1 válida quando é exigido mapear a rodada anterior', () => {
    expect(isMarketRoundSyncable(1, [1, 2, 3])).toBe(false);
    expect(isMarketRoundSyncable(0, [1, 2, 3])).toBe(false);
  });
});
