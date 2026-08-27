import TournamentPodium from './TournamentPodium';
import { AlertCircle } from 'lucide-react';
import type { StandingRow } from '@/types/tournament';

interface StandingsTableProps {
  rows: StandingRow[];
  badgeUrls: Record<string, string>;
  league: string;
  finished: boolean;
  isUserTeam?: (name: string) => boolean;
  statusMercado?: number;
}

const STAT_COLUMNS: Array<{ label: string; get: (row: StandingRow) => number }> = [
  { label: 'P', get: (r) => r.points },
  { label: 'J', get: (r) => r.played },
  { label: 'V', get: (r) => r.wins },
  { label: 'E', get: (r) => r.draws },
  { label: 'D', get: (r) => r.losses },
  { label: 'SG', get: (r) => r.goalDiff },
];

const fmt = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');

const getPositionColor = (position: number) => {
  if (position >= 1 && position <= 4) return 'text-emerald-400';
  if (position >= 17 && position <= 20) return 'text-red-400';
  return 'text-muted-foreground';
};

/** Renderização a partir do contrato normalizado (`StandingRow[]`). */
const StandingsTable = ({
  rows,
  badgeUrls,
  league,
  finished,
  isUserTeam,
  statusMercado,
}: StandingsTableProps) => {
  if (!rows.length) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Nenhum dado de classificação encontrado.
      </p>
    );
  }

  const badgeFor = (name: string) => badgeUrls[name] || badgeUrls[name.toUpperCase()];

  const podiumTeams = finished
    ? rows.slice(0, 3).map((row) => ({ name: row.teamName, badge: badgeFor(row.teamName) }))
    : [];

  const seriesLabel = league === 'serie_b' ? 'Série B' : league === 'serie_c' ? 'Série C' : 'Série A';

  return (
    <div className="mt-4 space-y-1">
      {finished && podiumTeams.length === 3 && (
        <TournamentPodium
          title={`Pódio Brasileirão ${seriesLabel}`}
          champion={podiumTeams[0].name}
          runnerUp={podiumTeams[1].name}
          third={podiumTeams[2].name}
          championBadge={podiumTeams[0].badge}
          runnerUpBadge={podiumTeams[1].badge}
          thirdBadge={podiumTeams[2].badge}
          isUserTeam={isUserTeam}
        />
      )}
      {statusMercado === 2 && (
        <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-md p-2 mb-2 flex items-center gap-2 text-[11px] text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>A classificação não é atualizada em tempo real, apenas após reabertura do mercado.</span>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
        <div className="w-6 text-center flex-shrink-0">#</div>
        <div className="flex-1 min-w-0 pl-6 text-left">Classificação</div>
        {STAT_COLUMNS.map((col) => (
          <div key={col.label} className="w-6 text-center flex-shrink-0">{col.label}</div>
        ))}
      </div>

      {/* Data rows */}
      {rows.map((row) => {
        const badgeUrl = badgeFor(row.teamName);
        const highlighted = isUserTeam?.(row.teamName) ?? false;

        return (
          <div
            key={`${row.position}-${row.teamName}`}
            className={`flex items-center px-2 py-2 rounded-lg ${highlighted ? 'bg-red-500/25 border border-red-400/40' : 'bg-primary/15 border border-primary/20'}`}
          >
            <div className={`w-6 text-center flex-shrink-0 text-[10px] font-bold ${getPositionColor(row.position)}`}>
              {row.position}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                {badgeUrl && (
                  <img
                    src={badgeUrl}
                    alt={row.teamName}
                    className="w-5 h-5 object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
              <span className={`text-xs font-semibold truncate text-left ${highlighted ? 'text-red-300 font-bold' : 'text-foreground'}`}>
                {row.teamName}
              </span>
            </div>
            {STAT_COLUMNS.map((col) => (
              <div key={col.label} className="w-6 text-center flex-shrink-0 text-[10px] text-muted-foreground">
                {fmt(col.get(row))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default StandingsTable;
