import { calculateStandings } from '../../standings/engine.ts';
import { resolvePreset } from '../../standings/presets.ts';
import type { MatchInput, StandingRow } from '../../standings/types.ts';
import type { TournamentDefinition } from '../../tournament/types.ts';

export function standingsStep(
  def: TournamentDefinition,
  matches: MatchInput[],
): Record<string, StandingRow[]> {
  if (!matches.length) return {};
  return calculateStandings(matches, resolvePreset(def.standingsPreset));
}
