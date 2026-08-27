import { cn } from '@/lib/utils';
import { ArrowLeftRight, ArrowUp, ArrowDown } from 'lucide-react';
import { COPA_PLAYER_DEFAULT_IMAGE } from '@/utils/copaPlayerImages';

interface PlayerBadgeProps {
  name: string;
  positionId: number;
  club: string;
  price: number;
  isCaptain?: boolean;
  isReservaLuxo?: boolean;
  clubBadgeUrl?: string;
  photoUrl?: string;
  statusId?: number;
  className?: string;
  partialScore?: number;
  showPartialScore?: boolean;
  variacao?: number;
  showOpenMarketLayout?: boolean;
  gameStatus?: 'not_started' | 'played' | 'not_played';
  isSubbedIn?: boolean;
  isSubbedOut?: boolean;
}

const getStatusRing = (statusId?: number): string => {
  switch (statusId) {
    case 7:
      return 'ring-2 ring-blue-400';
    case 3:
    case 5:
      return 'ring-2 ring-red-500';
    case 2:
      return 'ring-2 ring-yellow-500';
    case 6:
      return 'ring-2 ring-gray-500';
    default:
      return '';
  }
};

const positionColors: Record<number, string> = {
  1: 'bg-yellow-600',   // GOL
  2: 'bg-blue-600',     // LAT
  3: 'bg-blue-700',     // ZAG
  4: 'bg-green-600',    // MEI
  5: 'bg-red-600',      // ATA
  6: 'bg-purple-600',   // TEC
};

const PlayerBadge = ({
  name,
  positionId,
  club,
  price,
  isCaptain = false,
  isReservaLuxo = false,
  clubBadgeUrl,
  photoUrl,
  statusId,
  className,
  partialScore,
  showPartialScore = false,
  variacao,
  showOpenMarketLayout = false,
  gameStatus,
  isSubbedIn = false,
  isSubbedOut = false,
}: PlayerBadgeProps) => {
  const formatCurrency = (value: number) => {
    return `C$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Nome acima da foto quando mercado aberto */}
      {showOpenMarketLayout && (
        <div className="text-center min-w-[80px] max-w-[110px] bg-black/60 rounded-sm px-1.5 py-0.5 mb-0.5">
          <p className="text-[10px] font-medium text-white truncate">{name}</p>
        </div>
      )}
      <div className="relative">
        {isCaptain && (
          <div className="absolute -top-1 -right-1 z-10 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center border border-yellow-500">
            <span className="text-black font-extrabold text-[10px] leading-none">C</span>
          </div>
        )}
        {isReservaLuxo && (
          <div className="absolute -top-1 -left-1 z-10 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white">
            <ArrowLeftRight className="w-3 h-3 text-white" />
          </div>
        )}
        {isSubbedIn && (
          <div className="absolute -bottom-1 -right-1 z-10 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
            <ArrowUp className="w-3 h-3 text-white" />
          </div>
        )}
        {isSubbedOut && (
          <div className="absolute -bottom-1 -right-1 z-10 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white">
            <ArrowDown className="w-3 h-3 text-white" />
          </div>
        )}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className={cn(
              'w-12 h-12 rounded-full object-cover border-2 border-white/30 bg-[hsl(142,40%,18%)]',
              getStatusRing(statusId)
            )}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.includes('/copa2026/') && !img.src.endsWith('OUT.png')) {
                img.src = COPA_PLAYER_DEFAULT_IMAGE;
                return;
              }
              img.style.display = 'none';
              const parent = img.parentElement;
              if (parent) {
                const fallback = parent.querySelector('.fb, .fallback-initials');
                if (fallback) (fallback as HTMLElement).style.display = 'flex';
              }
            }}
          />
        ) : null}
        <div
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-white/30 fallback-initials',
            positionColors[positionId] || 'bg-gray-600',
            getStatusRing(statusId),
            photoUrl ? 'hidden' : ''
          )}
          style={photoUrl ? { display: 'none' } : undefined}
        >
          {getInitials(name)}
        </div>
      </div>
      <div className="mt-1 text-center min-w-[80px] max-w-[110px] bg-black/60 rounded-sm px-1.5 py-0.5">
        {!showOpenMarketLayout && (
          <p className="text-xs font-medium text-foreground truncate">{name}</p>
        )}
        {showOpenMarketLayout ? (
          <>
            {isCaptain ? (
              <p className="text-xs font-semibold text-white">
                {(partialScore ?? 0).toFixed(2).replace('.', ',')}
                <span className="text-[8px] text-blue-400 mx-0.5 font-bold">x1.5</span>
                {((partialScore ?? 0) * 1.5).toFixed(2).replace('.', ',')}
              </p>
            ) : (
              <p className="text-xs font-semibold text-white">
                {(partialScore ?? 0).toFixed(2).replace('.', ',')}
              </p>
            )}
            <p className={`text-[10px] font-semibold ${(variacao ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(variacao ?? 0) > 0 ? '+' : ''}{`C$ ${(variacao ?? 0).toFixed(2).replace('.', ',')}`}
            </p>
          </>
        ) : showPartialScore && gameStatus === 'not_started' ? (
          <p className="text-[10px] font-semibold text-muted-foreground">-</p>
        ) : showPartialScore && gameStatus === 'not_played' ? (
          <p className="text-[10px] font-bold text-red-500">x</p>
        ) : showPartialScore && partialScore !== undefined ? (
          isCaptain ? (
            <p className={`text-[10px] font-semibold ${partialScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(partialScore / 1.5).toFixed(2).replace('.', ',')}
              <span className="text-[8px] text-blue-400 mx-0.5">x1.5</span>
              {partialScore.toFixed(2).replace('.', ',')}
            </p>
          ) : (
            <p className={`text-[10px] font-semibold ${partialScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {partialScore.toFixed(2).replace('.', ',')}
            </p>
          )
        ) : (
          <p className="text-[10px] text-success font-semibold">{formatCurrency(price)}</p>
        )}
      </div>
    </div>
  );
};

export default PlayerBadge;
