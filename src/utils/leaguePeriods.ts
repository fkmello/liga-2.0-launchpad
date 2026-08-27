export interface LeaguePeriod {
  label: string;
  key: string;
  group: 'geral' | 'turno' | 'mes';
}

export const ALL_PERIODS: LeaguePeriod[] = [
  { label: 'ANUAL', key: 'ANUAL', group: 'geral' },
  { label: '1º TURNO', key: '1_TURNO', group: 'turno' },
  { label: '2º TURNO', key: '2_TURNO', group: 'turno' },
  { label: 'FEVEREIRO', key: 'FEVEREIRO', group: 'mes' },
  { label: 'MARÇO', key: 'MARCO', group: 'mes' },
  { label: 'ABRIL', key: 'ABRIL', group: 'mes' },
  { label: 'MAIO', key: 'MAIO', group: 'mes' },
  { label: 'JUNHO', key: 'JUNHO', group: 'mes' },
  { label: 'JULHO', key: 'JULHO', group: 'mes' },
  { label: 'AGOSTO', key: 'AGOSTO', group: 'mes' },
  { label: 'SETEMBRO', key: 'SETEMBRO', group: 'mes' },
  { label: 'OUTUBRO', key: 'OUTUBRO', group: 'mes' },
  { label: 'NOVEMBRO', key: 'NOVEMBRO', group: 'mes' },
  { label: 'DEZEMBRO', key: 'DEZEMBRO', group: 'mes' },
];

export const CURRENT_SEASON_YEAR = 2026;

export const PERIODOS_TABS = ALL_PERIODS.filter(p => p.group === 'geral' || p.group === 'turno');
export const MESES = ALL_PERIODS.filter(p => p.group === 'mes');

const labelToKeyMap = new Map(ALL_PERIODS.map(p => [p.label, p.key]));
const keyToLabelMap = new Map(ALL_PERIODS.map(p => [p.key, p.label]));

export const getCanonicalKey = (label: string): string =>
  labelToKeyMap.get(label) || label;

export const getLabelFromKey = (key: string): string =>
  keyToLabelMap.get(key) || key;
