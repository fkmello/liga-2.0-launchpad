import { Confronto } from '@/hooks/useGoogleSheets';
import { cn } from '@/lib/utils';

interface MatchCardProps {
  match: Confronto;
  badgeUrls?: Record<string, string>;
  isUserTeam?: (name: string) => boolean;
  onMatchClick?: () => void;
  disabled?: boolean;
  partialScore1?: number;
  partialScore2?: number;
  playedCount1?: number;
  playedCount2?: number;
}

const MatchCard = ({ match, badgeUrls, isUserTeam, onMatchClick, disabled, partialScore1, partialScore2, playedCount1, playedCount2 }: MatchCardProps) => {
  const team1Badge = badgeUrls?.[match.team1.toUpperCase()] || badgeUrls?.[match.team1];
  const team2Badge = badgeUrls?.[match.team2.toUpperCase()] || badgeUrls?.[match.team2];
  const isClickable = !!onMatchClick && !disabled;
  const cardHighlighted = (isUserTeam?.(match.team1) || isUserTeam?.(match.team2)) ?? false;

  const renderTeamBlock = (teamName: string, badge: string | undefined) => {
    const highlighted = isUserTeam?.(teamName) ?? false;
    return (
      <div className="flex flex-col items-center w-20">
        <div className="w-10 h-10 flex items-center justify-center">
          {badge ? (
            <img src={badge} alt={teamName} className="w-10 h-10 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>
        <span className={`text-[10px] font-medium text-center leading-tight mt-1 break-words w-full ${highlighted ? 'text-red-300 font-bold' : 'text-foreground'}`}>
          {teamName}
        </span>
      </div>
    );
  };

  const handleClick = () => {
    if (isClickable) onMatchClick();
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "rounded-lg px-3 py-3 transition-all border",
        cardHighlighted ? "bg-red-500/15 border-red-400/40" : "bg-primary/15 border-primary/20",
        isClickable && (cardHighlighted ? "cursor-pointer hover:bg-red-500/25" : "cursor-pointer hover:bg-primary/25"),
        isClickable && "active:scale-[0.98]",
        disabled && "opacity-50 pointer-events-none cursor-not-allowed"
      )}
    >
      <div className="flex items-center justify-center gap-1">
        {/* Played count left */}
        <div className="w-8 flex-shrink-0 text-center">
          {playedCount1 !== undefined && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {playedCount1}/12
            </span>
          )}
        </div>

        {renderTeamBlock(match.team1, team1Badge)}

        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground min-w-[1.25rem] text-center">
            {partialScore1 !== undefined ? partialScore1.toFixed(2) : (match.score1 || '-')}
          </span>
          <span className="text-sm text-muted-foreground font-medium">x</span>
          <span className="text-lg font-bold text-foreground min-w-[1.25rem] text-center">
            {partialScore2 !== undefined ? partialScore2.toFixed(2) : (match.score2 || '-')}
          </span>
        </div>

        {renderTeamBlock(match.team2, team2Badge)}

        {/* Played count right */}
        <div className="w-8 flex-shrink-0 text-center">
          {playedCount2 !== undefined && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {playedCount2}/12
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchCard;
