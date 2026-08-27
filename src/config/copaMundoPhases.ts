/**
 * Chaves internas obrigatórias das fases da Copa do Mundo FIFA.
 * Use SEMPRE estas chaves em backend (cache), hooks, queryKeys, comparações
 * e roteamento. Labels humanos só aparecem na UI via COPA_MUNDO_PHASE_LABELS.
 */
export type CopaMundoPhase =
  | 'fase_grupos'
  | '16avos'
  | 'oitavas'
  | 'quartas'
  | 'semifinal'
  | 'final';

export const COPA_MUNDO_KO_PHASES: Exclude<CopaMundoPhase, 'fase_grupos'>[] = [
  '16avos',
  'oitavas',
  'quartas',
  'semifinal',
  'final',
];

export const COPA_MUNDO_PHASE_LABELS: Record<CopaMundoPhase, string> = {
  fase_grupos: 'Fase de Grupos',
  '16avos': '16-avos de Final',
  oitavas: 'Oitavas de Final',
  quartas: 'Quartas de Final',
  semifinal: 'Semifinal',
  final: 'Final',
};

export const COPA_MUNDO_CACHE_VERSION = 1;
