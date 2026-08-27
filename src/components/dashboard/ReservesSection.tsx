import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CartolaPlayer } from '@/types';
import { ArrowLeftRight, ArrowDown } from 'lucide-react';
import { COPA_PLAYER_DEFAULT_IMAGE } from '@/utils/copaPlayerImages';

interface ReservesSectionProps {
  reserves: CartolaPlayer[];
  reservaLuxoId?: number | null;
  statusMercado?: number;
}

const POSICAO_LABELS: Record<number, string> = {
  1: 'GOL',
  2: 'LAT',
  3: 'ZAG',
  4: 'MEI',
  5: 'ATA',
};

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

const ReservesSection = ({ reserves = [], reservaLuxoId, statusMercado }: ReservesSectionProps) => {
  return (
    <Card className="glass-card my-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          Banco de Reservas
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-5 gap-1">
          {reserves.length > 0 ? (
            [...reserves].sort((a, b) => a.posicao_id - b.posicao_id).map((player) => (
              <div
                key={player.atleta_id}
                className="flex flex-col items-center p-1 rounded-lg bg-secondary/50 relative"
              >
                {reservaLuxoId != null && player.atleta_id === reservaLuxoId && (
                  <div className="absolute -top-1 -left-1 z-10 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white">
                    <ArrowLeftRight className="w-2.5 h-2.5 text-white" />
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
                    alt={player.apelido}
                    className={`w-8 h-8 rounded-full object-cover ${getStatusRing(player.status_id)}`}
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
                ) : null}
                <div
                  className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground fb ${player.foto ? 'hidden' : ''} ${getStatusRing(player.status_id)}`}
                  style={player.foto ? { display: 'none' } : undefined}
                >
                  {POSICAO_LABELS[player.posicao_id] || '?'}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 text-center truncate w-full">
                  {player.apelido || 'Reserva'}
                </span>
                <span className={`text-[10px] font-semibold whitespace-nowrap ${
                  statusMercado === 2
                    ? player.game_status === 'not_started'
                      ? 'text-muted-foreground'
                      : player.game_status === 'not_played'
                      ? 'text-red-500'
                      : player.pontuacao >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                    : statusMercado === 1
                    ? 'text-white'
                    : 'text-success'
                }`}>
                  {statusMercado === 2
                    ? player.game_status === 'not_started'
                      ? '-'
                      : player.game_status === 'not_played'
                      ? 'x'
                      : player.pontuacao.toFixed(2).replace('.', ',')
                    : statusMercado === 1
                    ? player.pontuacao.toFixed(2).replace('.', ',')
                    : `C$ ${player.preco_num?.toFixed(2).replace('.', ',')}`}
                </span>
                {statusMercado === 1 && (
                  <span className={`text-[9px] font-semibold whitespace-nowrap ${(player.variacao_num ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(player.variacao_num ?? 0) > 0 ? '+' : ''}C$ {(player.variacao_num ?? 0).toFixed(2).replace('.', ',')}
                  </span>
                )}
              </div>
            ))
          ) : (
            [1, 2, 3, 4, 5].map((pos) => (
              <div
                key={pos}
                className="flex flex-col items-center p-2 rounded-lg bg-secondary/50"
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {POSICAO_LABELS[pos]}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">—</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReservesSection;
