import { Trophy } from 'lucide-react';

interface PodiumSlotProps {
  place: 1 | 2 | 3;
  name?: string;
  badge?: string;
  heightClass: string;
  bgClass: string;
  labelColor: string;
  isUser?: boolean;
  big?: boolean;
}

const PodiumSlot = ({ place, name, badge, heightClass, bgClass, labelColor, isUser, big }: PodiumSlotProps) => {
  const badgeSize = big ? 'w-16 h-16' : 'w-12 h-12';
  const placeLabel = place === 1 ? 'Campeão' : place === 2 ? 'Vice' : '3º Lugar';
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0 max-w-[33%]">
      <div className={`relative ${badgeSize} flex items-center justify-center rounded-full bg-card border-2 ${isUser ? 'border-red-400 ring-2 ring-red-400/40' : 'border-border'}`}>
        {badge ? (
          <img src={badge} alt={name ?? ''} className={`${big ? 'w-12 h-12' : 'w-9 h-9'} object-contain`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <Trophy className="w-5 h-5 text-muted-foreground" />
        )}
        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full bg-card border border-border text-[10px] font-bold flex items-center justify-center ${labelColor}`}>
          {place}
        </div>
      </div>
      <span className={`text-[11px] font-semibold text-center leading-tight truncate w-full ${isUser ? 'text-red-300' : 'text-foreground'}`}>
        {name ?? '—'}
      </span>
      <div className={`w-full ${heightClass} ${bgClass} border-t-2 rounded-t-sm flex items-start justify-center pt-1`}>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${labelColor}`}>{placeLabel}</span>
      </div>
    </div>
  );
};

interface TournamentPodiumProps {
  title: string;
  champion?: string;
  runnerUp?: string;
  third?: string;
  championBadge?: string;
  runnerUpBadge?: string;
  thirdBadge?: string;
  isUserTeam?: (name: string) => boolean;
}

const TournamentPodium = ({
  title,
  champion,
  runnerUp,
  third,
  championBadge,
  runnerUpBadge,
  thirdBadge,
  isUserTeam,
}: TournamentPodiumProps) => {
  if (!champion && !runnerUp && !third) return null;
  return (
    <div className="rounded-lg bg-gradient-to-b from-primary/15 to-card border border-primary/30 p-4 mb-3">
      <div className="flex items-center justify-center gap-2 mb-5">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <span className="text-sm font-bold text-foreground uppercase tracking-wider">{title}</span>
        <Trophy className="w-5 h-5 text-yellow-400" />
      </div>
      <div className="flex items-end justify-center gap-3">
        <PodiumSlot
          place={2}
          name={runnerUp}
          badge={runnerUpBadge}
          heightClass="h-14"
          bgClass="bg-slate-400/25 border-slate-300/40"
          labelColor="text-slate-200"
          isUser={!!runnerUp && (isUserTeam?.(runnerUp) ?? false)}
        />
        <PodiumSlot
          place={1}
          name={champion}
          badge={championBadge}
          heightClass="h-24"
          bgClass="bg-yellow-500/25 border-yellow-400/50"
          labelColor="text-yellow-300"
          isUser={!!champion && (isUserTeam?.(champion) ?? false)}
          big
        />
        <PodiumSlot
          place={3}
          name={third}
          badge={thirdBadge}
          heightClass="h-10"
          bgClass="bg-amber-700/30 border-amber-600/40"
          labelColor="text-amber-400"
          isUser={!!third && (isUserTeam?.(third) ?? false)}
        />
      </div>
    </div>
  );
};

export default TournamentPodium;
