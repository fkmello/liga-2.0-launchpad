import type { AdapterContext, TournamentAdapter } from '../../tournament/types.ts';

export async function fetchStep(
  adapters: TournamentAdapter[],
  ctx: AdapterContext,
): Promise<unknown[]> {
  return await Promise.all(adapters.map((a) => a.fetchRaw(ctx)));
}
