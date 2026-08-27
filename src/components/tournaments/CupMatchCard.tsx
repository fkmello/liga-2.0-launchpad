import { ConfrontoCopa } from '@/hooks/useGoogleSheets';
import { cn } from '@/lib/utils';

interface CupMatchCardProps {
  match: ConfrontoCopa;
  badgeUrls?: Record<string, string>;
  isFinal?: boolean;
  isUserTeam?: (name: string) => boolean;
  onMatchClick?: () => void;
  disabled?: boolean;
  activeLeg?: 'ida' | 'volta' | null;
  partialScore1?: number;
  partialScore2?: number;
  playedCount1?: number;
  playedCount2?: number;
}

function calcTotal(scoreIda: string, scoreVolta: string): string {
  const ida = parseFloat(scoreIda.replace(',', '.'));
  const volta = parseFloat(scoreVolta.replace(',', '.'));
  if (!isNaN(ida) && !isNaN(volta)) return (ida + volta).toFixed(2);
  if (!isNaN(ida)) return ida.toFixed(2);
  if (!isNaN(volta)) return volta.toFixed(2);
  return '-';
}

function calcDynamicTotal(
  scoreIda: string,
  scoreVolta: string,
  activeLeg: 'ida' | 'volta' | null,
  partial?: number,
): string {
  if (!activeLeg || partial === undefined) return calcTotal(scoreIda, scoreVolta);

  if (activeLeg === 'ida') {
    const volta = parseFloat(scoreVolta.replace(',', '.'));
    if (!isNaN(volta)) return (partial + volta).toFixed(2);
    return partial.toFixed(2);
  }
  // volta
  const ida = parseFloat(scoreIda.replace(',', '.'));
  if (!isNaN(ida)) return (ida + partial).toFixed(2);
  return partial.toFixed(2);
}

const formatPartial = (v: number) => v.toFixed(2).replace('.', ',');

const normalizeName = (n: string) =>
  n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const findBadge = (name: string, urls?: Record<string, string>) =>
  urls?.[name] || urls?.[name.toUpperCase()] || urls?.[name.toLowerCase()] || urls?.[normalizeName(name)];

const CupMatchCard = ({
  match, badgeUrls, isFinal, isUserTeam, onMatchClick, disabled,
  activeLeg, partialScore1, partialScore2, playedCount1, playedCount2,
}: CupMatchCardProps) => {
  const team1Empty = !match.team1;
  const team2Empty = !match.team2;
  const team1Badge = !team1Empty ? findBadge(match.team1, badgeUrls) : undefined;
  const team2Badge = !team2Empty ? findBadge(match.team2, badgeUrls) : undefined;
  const isClickable = !!onMatchClick && !disabled;
  const showPartials = !!activeLeg;
  const cardHighlighted =
    (!team1Empty && (isUserTeam?.(match.team1) ?? false)) ||
    (!team2Empty && (isUserTeam?.(match.team2) ?? false));

  const handleClick = () => {
    if (isClickable) onMatchClick();
  };

  const cardClass = cn(
    "rounded-lg px-3 py-3 transition-all border",
    cardHighlighted ? "bg-red-500/15 border-red-400/40" : "bg-primary/15 border-primary/20",
    isClickable && (cardHighlighted ? "cursor-pointer hover:bg-red-500/25" : "cursor-pointer hover:bg-primary/25"),
    isClickable && "active:scale-[0.98]",
    disabled && "opacity-50 pointer-events-none cursor-not-allowed"
  );

  if (isFinal) {
    const score1 = showPartials && partialScore1 !== undefined
      ? formatPartial(partialScore1)
      : (match.scoreIda1 || '-');
    const score2 = showPartials && partialScore2 !== undefined
      ? formatPartial(partialScore2)
      : (match.scoreIda2 || '-');

    const renderTeamBlock = (teamName: string, isEmpty: boolean, badge: string | undefined, playedCount?: number, side?: 'left' | 'right') => (
      <div className="flex flex-col items-center w-20">
        <div className="flex items-center gap-1">
          {side === 'left' && showPartials && playedCount !== undefined && (
            <span className="text-[9px] text-muted-foreground font-medium">{playedCount}/12</span>
          )}
          <div className="w-10 h-10 flex items-center justify-center">
            {badge ? (
              <img src={badge} alt={teamName} className="w-10 h-10 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="w-10 h-10" />
            )}
          </div>
          {side === 'right' && showPartials && playedCount !== undefined && (
            <span className="text-[9px] text-muted-foreground font-medium">{playedCount}/12</span>
          )}
        </div>
        <span className={`text-[10px] font-medium text-center leading-tight mt-1 break-words w-full ${!isEmpty && isUserTeam?.(teamName) ? 'text-red-300 font-bold' : 'text-foreground'}`}>
          {isEmpty ? <span className="italic text-muted-foreground">Aguardando</span> : teamName}
        </span>
      </div>
    );

    return (
      <div onClick={handleClick} className={cardClass}>
        <div className="text-center mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {/^\d+$/.test(match.matchNumber) ? `Jogo ${match.matchNumber}` : match.matchNumber}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          {renderTeamBlock(match.team1, team1Empty, team1Badge, playedCount1, 'left')}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground min-w-[1.25rem] text-center">
              {team1Empty ? '' : score1}
            </span>
            <span className="text-sm text-muted-foreground font-medium">x</span>
            <span className="text-lg font-bold text-foreground min-w-[1.25rem] text-center">
              {team2Empty ? '' : score2}
            </span>
          </div>
          {renderTeamBlock(match.team2, team2Empty, team2Badge, playedCount2, 'right')}
        </div>
      </div>
    );
  }

  // Regular cup match with IDA/VOLTA/TOTAL
  const total1 = calcDynamicTotal(match.scoreIda1, match.scoreVolta1, activeLeg, partialScore1);
  const total2 = calcDynamicTotal(match.scoreIda2, match.scoreVolta2, activeLeg, partialScore2);

  const getIda = (score: string, partial?: number) =>
    activeLeg === 'ida' && partial !== undefined ? formatPartial(partial) : (score || '-');
  const getVolta = (score: string, partial?: number) =>
    activeLeg === 'volta' && partial !== undefined ? formatPartial(partial) : (score || '-');

  const renderTeamRow = (
    teamName: string,
    isEmpty: boolean,
    badge: string | undefined,
    scoreIda: string,
    scoreVolta: string,
    total: string,
    partial?: number,
    playedCount?: number,
  ) => (
    <div className="flex items-center justify-center">
      <div className="w-32 shrink-0 min-w-0">
        {isEmpty ? (
          <span className="text-[10px] italic text-muted-foreground truncate block text-right">
            Aguardando classificação
          </span>
        ) : (
          <span className={`text-xs font-medium truncate block text-right ${isUserTeam?.(teamName) ? 'text-red-300 font-bold' : 'text-foreground'}`}>
            {teamName}
          </span>
        )}
      </div>
      <div className="w-6 h-6 mx-1 shrink-0 flex items-center justify-center">
        {badge && (
          <img src={badge} alt={teamName} className="w-5 h-5 object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
      </div>
      {showPartials && playedCount !== undefined && (
        <div className="w-8 shrink-0 text-center">
          <span className="text-[9px] text-muted-foreground font-medium">{playedCount}/12</span>
        </div>
      )}
      <div className="w-16 shrink-0 text-center">
        <span className={cn("text-sm font-bold", activeLeg === 'ida' && partial !== undefined ? 'text-primary' : 'text-foreground')}>
          {isEmpty ? '' : getIda(scoreIda, partial)}
        </span>
      </div>
      <div className="w-16 shrink-0 text-center">
        <span className={cn("text-sm font-bold", activeLeg === 'volta' && partial !== undefined ? 'text-primary' : 'text-foreground')}>
          {isEmpty ? '' : getVolta(scoreVolta, partial)}
        </span>
      </div>
      <div className="w-16 shrink-0 text-center">
        <span className="text-sm font-bold text-primary">{isEmpty ? '' : total}</span>
      </div>
    </div>
  );

  return (
    <div onClick={handleClick} className={cn(cardClass, "space-y-1")}>
      <div className="text-center mb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Jogo {match.matchNumber}
        </span>
      </div>
      <div className="flex items-center justify-center">
        <div className="w-32 shrink-0" />
        <div className="w-6 shrink-0" />
        {showPartials && <div className="w-8 shrink-0" />}
        <div className="w-16 shrink-0 text-center">
          <span className="text-[10px] font-semibold text-muted-foreground">IDA</span>
        </div>
        <div className="w-16 shrink-0 text-center">
          <span className="text-[10px] font-semibold text-muted-foreground">VOLTA</span>
        </div>
        <div className="w-16 shrink-0 text-center">
          <span className="text-[10px] font-semibold text-muted-foreground">TOTAL</span>
        </div>
      </div>
      {renderTeamRow(match.team1, team1Empty, team1Badge, match.scoreIda1, match.scoreVolta1, total1, partialScore1, playedCount1)}
      <div className="border-t border-primary/10 mx-4" />
      {renderTeamRow(match.team2, team2Empty, team2Badge, match.scoreIda2, match.scoreVolta2, total2, partialScore2, playedCount2)}
    </div>
  );
};

export default CupMatchCard;