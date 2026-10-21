/**
 * Determines whether the previous Cartola round maps to data this tournament
 * can actually update. The dispatcher receives the newly opened market round;
 * adapters update the previous round once the market is open.
 *
 * Undefined configuration preserves the existing behavior for league-style
 * tournaments such as Brasileirão Série A/B/C.
 */
export function isMarketRoundSyncable(
  currentMarketRound: number,
  syncableTargetRounds?: readonly number[],
): boolean {
  if (!syncableTargetRounds) return true;
  if (!Number.isInteger(currentMarketRound) || currentMarketRound <= 1) return false;
  return syncableTargetRounds.includes(currentMarketRound - 1);
}
