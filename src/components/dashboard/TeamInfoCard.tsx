import { Card, CardContent } from '@/components/ui/card';
import { Wallet, Target, Trophy, TrendingUp, TrendingDown } from 'lucide-react';

interface TeamInfoCardProps {
  patrimony: number;
  valorizacao?: number;
  roundPoints: number;
  totalPoints: number;
  partialRoundPoints?: number | null;
  statusMercado?: number;
  valorizacaoLive?: number;
}

const TeamInfoCard = ({ patrimony = 0, valorizacao = 0, roundPoints = 0, totalPoints = 0, partialRoundPoints, statusMercado, valorizacaoLive }: TeamInfoCardProps) => {
  const isLive = statusMercado === 2 && valorizacaoLive != null;
  const displayValorizacao = isLive ? valorizacaoLive : valorizacao;
  const displayPatrimony = isLive ? patrimony + valorizacaoLive : patrimony;
  const formatCurrency = (value: number) => {
    return `C$ ${value.toFixed(2).replace('.', ',')}`;
  };

  return (
    <Card className="glass-card mx-4 my-4">
      <CardContent className="p-4">
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <Wallet className="w-3.5 h-3.5 text-primary mr-0.5" />
              <span className="text-[10px] text-muted-foreground">Patrimônio</span>
            </div>
            <p className="text-sm font-bold text-foreground">{formatCurrency(displayPatrimony)}</p>
          </div>
          <div className="text-center border-x border-border">
            <div className="flex items-center justify-center mb-1">
              {displayValorizacao >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-500 mr-0.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500 mr-0.5" />
              )}
              <span className="text-[10px] text-muted-foreground">Valorização</span>
            </div>
            <p className={`text-sm font-bold ${displayValorizacao >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {displayValorizacao > 0 ? '+' : ''}{formatCurrency(displayValorizacao)}
            </p>
          </div>
          <div className="text-center border-r border-border">
            <div className="flex items-center justify-center mb-1">
              <Target className="w-3.5 h-3.5 text-primary mr-0.5" />
              <span className="text-[10px] text-muted-foreground">Pts Rodada</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {(statusMercado === 2 && partialRoundPoints != null ? partialRoundPoints : roundPoints).toFixed(2).replace('.', ',')}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <Trophy className="w-3.5 h-3.5 text-primary mr-0.5" />
              <span className="text-[10px] text-muted-foreground">Pts Total</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {(statusMercado === 2 && partialRoundPoints != null ? totalPoints + partialRoundPoints : totalPoints).toFixed(2).replace('.', ',')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamInfoCard;
