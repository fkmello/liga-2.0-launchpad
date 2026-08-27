import { Clock, RefreshCw } from 'lucide-react';
import { ReactNode, useState } from 'react';

interface HeaderProps {
  currentRound?: number;
  statusMercado?: number;
  fechamento?: string;
  teamName?: string;
  cartoileiroName?: string;
  escudo?: string;
  onRefresh?: () => void | Promise<void>;
}

const Header = ({
  currentRound = 1,
  statusMercado,
  fechamento,
  teamName,
  cartoileiroName,
  escudo,
  onRefresh,
}: HeaderProps) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const getStatusContent = (): ReactNode => {
    switch (statusMercado) {
      case 1:
        return (
          <div className="flex flex-col items-end leading-tight">
            <span>Mercado fecha em</span>
            <span className="font-medium">{fechamento || ''}</span>
          </div>
        );
      case 2:
        return <span>Mercado Fechado</span>;
      case 3:
        return <span>Final de Rodada</span>;
      case 4:
        return <span>Mercado em Manutenção</span>;
      default:
        return <span>{fechamento || 'Carregando...'}</span>;
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0">
          {escudo ? (
            <img src={escudo} alt="Escudo" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-bold text-sm">⚽</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">
              {teamName || 'Carregando...'}
            </h1>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {cartoileiroName || ''}
              </p>
              {onRefresh && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  aria-label="Atualizar dados do time"
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="flex items-center justify-end gap-1 text-primary">
            <span className="text-sm font-semibold">Rodada {currentRound}</span>
          </div>
          <div className="flex items-center justify-end gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Clock className="w-3 h-3 flex-shrink-0" />
            {getStatusContent()}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
