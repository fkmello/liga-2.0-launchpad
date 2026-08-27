import type { AppLeague } from '@/contexts/AppLeagueContext';

/**
 * Slugs de torneios permitidos por liga.
 * Usar EXATAMENTE os slugs já existentes nas rotas (não encurtar).
 */
export const LEAGUE_SLUGS: Record<AppLeague, string[]> = {
  brasileirao: [
    'brasileirao-serie-a',
    'brasileirao-serie-b',
    'brasileirao-serie-c',
    'copa-do-brasil',
    'libertadores',
    'sulamericana',
    'copa-intercontinental',
  ],
  campeoes: ['champions-league'],
  copa_mundo: ['copa-do-mundo'],
};
