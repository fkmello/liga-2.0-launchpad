import TournamentPodium from './TournamentPodium';
import { AlertCircle } from 'lucide-react';
import type { ClassificacaoData } from '@/hooks/useGoogleSheets';

// Columns to hide (0-indexed): J=9, K=10, M=12, O=14
const HIDDEN_COLUMNS = new Set([9, 10, 12, 14]);

interface LegacyClassificacaoTableProps {
  data: ClassificacaoData | null | undefined;
  badgeUrls: Record<string, string>;
  league: string;
  finished: boolean;
  isUserTeam?: (name: string) => boolean;
  statusMercado?: number;
}

/**
 * Renderização legada (matriz da planilha). Mantida sem alterações de
 * comportamento para Série B, Série C e demais ligas que ainda usam o
 * contrato legado.
 */
const LegacyClassificacaoTable = ({
  data,
  badgeUrls,
  league,
  finished,
  isUserTeam,
  statusMercado,
}: LegacyClassificacaoTableProps) => {
  if (!data?.data || data.data.length < 4) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Nenhum dado de classificação encontrado.
      </p>
    );
  }

  // Skip first 2 rows (empty + title), row index 2 = headers, 3+ = data
  const headers = data.data[2];
  const rows = data.data.slice(3).filter(row => row.some(cell => cell?.trim()));

  // Sort by tiebreak criteria and recalculate positions
  const parseNum = (val: string | undefined): number =>
    parseFloat((val || '0').replace(',', '.')) || 0;

  const sortedRows = [...rows].sort((a, b) => {
    const pA = parseNum(a[4]), pB = parseNum(b[4]);
    if (pB !== pA) return pB - pA;
    const vA = parseNum(a[6]), vB = parseNum(b[6]);
    if (vB !== vA) return vB - vA;
    const sgA = parseNum(a[11]), sgB = parseNum(b[11]);
    if (sgB !== sgA) return sgB - sgA;
    const gpA = parseNum(a[13]), gpB = parseNum(b[13]);
    return gpB - gpA;
  }).map((row, idx) => {
    const newRow = [...row];
    newRow[1] = String(idx + 1);
    return newRow;
  });

  // Visible columns: skip index 0 (empty col A), 2 (badge col C), and hidden columns
  const visibleHeaderIndices = headers
    .map((_, i) => i)
    .filter(i => i !== 0 && i !== 2 && !HIDDEN_COLUMNS.has(i));

  const getPositionColor = (position: number) => {
    if (position >= 1 && position <= 4) return 'text-emerald-400';
    if (position >= 17 && position <= 20) return 'text-red-400';
    return 'text-muted-foreground';
  };

  const podiumTeams = finished
    ? sortedRows.slice(0, 3).map((row) => ({
        name: row[3]?.trim() || '',
        badge: badgeUrls[row[3]?.trim() || ''] || badgeUrls[(row[3] || '').toUpperCase()],
      }))
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
        {visibleHeaderIndices.map((colIdx) => {
          if (colIdx === 1) {
            return <div key={colIdx} className="w-6 text-center flex-shrink-0">{headers[colIdx]}</div>;
          }
          if (colIdx === 3) {
            return <div key={colIdx} className="flex-1 min-w-0 pl-6 text-left">{headers[colIdx]}</div>;
          }
          return (
            <div key={colIdx} className="w-7 text-center flex-shrink-0">
              {headers[colIdx]}
            </div>
          );
        })}
      </div>

      {/* Data rows */}
      {sortedRows.map((row, rowIdx) => {
        const position = parseInt(row[1], 10);
        const teamName = row[3]?.trim() || '';
        const badgeUrl = badgeUrls[teamName] || badgeUrls[teamName.toUpperCase()];
        const highlighted = isUserTeam?.(teamName) ?? false;

        return (
          <div
            key={rowIdx}
            className={`flex items-center px-2 py-2 rounded-lg ${highlighted ? 'bg-red-500/25 border border-red-400/40' : 'bg-primary/15 border border-primary/20'}`}
          >
            {visibleHeaderIndices.map((colIdx) => {
              if (colIdx === 1) {
                return (
                  <div key={colIdx} className={`w-6 text-center flex-shrink-0 text-[10px] font-bold ${getPositionColor(position)}`}>
                    {row[colIdx]}
                  </div>
                );
              }
              if (colIdx === 3) {
                // Badge + Team name
                return (
                  <div key={colIdx} className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      {badgeUrl && (
                        <img
                          src={badgeUrl}
                          alt={teamName}
                          className="w-5 h-5 object-contain"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </div>
                    <span className={`text-xs font-semibold truncate text-left ${highlighted ? 'text-red-300 font-bold' : 'text-foreground'}`}>
                      {teamName}
                    </span>
                  </div>
                );
              }
              // Stat columns
              return (
                <div key={colIdx} className="w-7 text-center flex-shrink-0 text-[10px] text-muted-foreground">
                  {row[colIdx] || ''}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default LegacyClassificacaoTable;
