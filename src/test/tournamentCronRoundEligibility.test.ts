import { describe, expect, it } from 'vitest';
import { isMarketRoundSyncable } from '../../supabase/functions/_shared/tournament/roundEligibility';
import { COPA_BRASIL_SYNCABLE_TARGET_ROUNDS } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-copa-brasil';
import { LIBERTADORES_SYNCABLE_TARGET_ROUNDS } from '../../supabase/functions/_shared/providers/cartola-brasileirao/adapter-libertadores';

describe('cron — elegibilidade da rodada-alvo', () => {
  it('mantém o comportamento atual quando o torneio não configura rodadas específicas', () => {
    expect(isMarketRoundSyncable(31)).toBe(true);
    expect(isMarketRoundSyncable(2)).toBe(true);
  });

  it('não sincroniza quando a rodada anterior não corresponde a uma fase mapeada', () => {
    expect(isMarketRoundSyncable(31, COPA_BRASIL_SYNCABLE_TARGET_ROUNDS)).toBe(false); // alvo 30 não mapeado
  });

  it('permite sincronizar quando a rodada anterior está mapeada', () => {
    expect(isMarketRoundSyncable(35, COPA_BRASIL_SYNCABLE_TARGET_ROUNDS)).toBe(true); // alvo 34
    expect(isMarketRoundSyncable(32, LIBERTADORES_SYNCABLE_TARGET_ROUNDS)).toBe(true); // alvo 31
  });

  it('não considera rodada 1 válida quando é exigido mapear a rodada anterior', () => {
    expect(isMarketRoundSyncable(1, [1, 2, 3])).toBe(false);
    expect(isMarketRoundSyncable(0, [1, 2, 3])).toBe(false);
  });
});
