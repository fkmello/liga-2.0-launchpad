import { NormalizedPlayer } from '@/utils/matchComparison';
import { cn } from '@/lib/utils';
import { ArrowLeftRight, ArrowUp, ArrowDown } from 'lucide-react';
import { COPA_PLAYER_DEFAULT_IMAGE } from '@/utils/copaPlayerImages';

interface PlayerComparisonCardProps {
  player: NormalizedPlayer;
  isRepeated: boolean;
  align: 'left' | 'right';
  statusMercado?: number | null;
}

const PlayerComparisonCard = ({ player, isRepeated, align, statusMercado }: PlayerComparisonCardProps) => {
  const isRight = align === 'right';
  const isClosed = statusMercado === 2;

  const formatVariacao = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `$ ${sign}${val.toFixed(2)}`;
  };

  const renderPoints = () => {
    // Game status indicators (market closed only)
    if (isClosed && player.game_status === 'not_started') {
      return (
        <span className="text-xs font-bold flex-shrink-0 min-w-[2.5rem] text-center text-muted-foreground">
          -
        </span>
      );
    }
    if (isClosed && player.game_status === 'not_played') {
      return (
        <span className="text-xs font-bold flex-shrink-0 min-w-[2.5rem] text-center text-destructive">
          x
        </span>
      );
    }

    // Captain with multiplier
    if (player.is_capitao && player.pontuacao_base !== undefined) {
      return (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-[10px] font-bold text-foreground">
            {player.pontuacao_base.toFixed(2)}
          </span>
          <span className="text-[8px] font-semibold text-blue-400">
            x1.5
          </span>
          <span className={cn(
            'text-[10px] font-bold',
            player.pontuacao > 0 ? 'text-emerald-400' :
            player.pontuacao < 0 ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {player.pontuacao.toFixed(2)}
          </span>
        </span>
      );
    }

    // Normal points
    return (
      <span className={cn(
        'text-xs font-bold flex-shrink-0 min-w-[2.5rem] text-center',
        player.pontuacao > 0 ? 'text-emerald-400' :
        player.pontuacao < 0 ? 'text-destructive' : 'text-muted-foreground'
      )}>
        {player.pontuacao.toFixed(2)}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 bg-card border border-border/50',
        isRepeated && 'border-l-2 border-l-primary/60 bg-primary/5',
        isRight && 'flex-row-reverse'
      )}
    >
      {/* Player photo (club badge) */}
      <div className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center">
        {player.is_capitao && (
          <div className="absolute -top-1 -right-1 z-10 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center border border-yellow-500">
            <span className="text-black font-extrabold text-[8px] leading-none">C</span>
          </div>
        )}
        {player.is_reserva_luxo && (
          <div className="absolute -top-1 -left-1 z-10 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-white">
            <ArrowLeftRight className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {player.is_subbed_in && (
          <div className="absolute -bottom-1 -right-1 z-10 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
            <ArrowUp className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {player.is_subbed_out && (
          <div className="absolute -bottom-1 -right-1 z-10 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border-2 border-white">
            <ArrowDown className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        {player.foto ? (
          <img
            src={player.foto}
            alt={player.nome}
            className="w-7 h-7 object-contain"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src.includes('/copa2026/') && !img.src.endsWith('OUT.png')) {
                img.src = COPA_PLAYER_DEFAULT_IMAGE;
                return;
              }
              img.style.display = 'none';
              const parent = img.parentElement;
              if (parent) {
                const fb = parent.querySelector('.fb, .fallback-initials');
                if (fb) (fb as HTMLElement).style.display = 'flex';
              }
            }}
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted" />
        )}
      </div>

      {/* Name + valorization */}
      <div className={cn('flex-1 min-w-0', isRight && 'text-right')}>
        <p className="text-[11px] font-medium text-foreground truncate leading-tight">
          {player.nome}
        </p>
        <p className={cn(
          'text-[9px] font-medium leading-tight',
          player.variacao > 0 ? 'text-emerald-400' :
          player.variacao < 0 ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {formatVariacao(player.variacao)}
        </p>
      </div>

      {/* Points */}
      {renderPoints()}
    </div>
  );
};

export default PlayerComparisonCard;
