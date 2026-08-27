import { useNavigate, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import Header from '@/components/dashboard/Header';
import TeamInfoCard from '@/components/dashboard/TeamInfoCard';
import SoccerField from '@/components/dashboard/SoccerField';
import ReservesSection from '@/components/dashboard/ReservesSection';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useCartolaTeam } from '@/hooks/useCartolaTeam';
import { useUserTeamsForLeague } from '@/hooks/useUserTeamsForLeague';
import { useAppLeague } from '@/contexts/AppLeagueContext';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { AlertCircle, Wrench, ArrowRightLeft, Trophy } from 'lucide-react';

const LEAGUE_LABELS: Record<string, string> = {
  brasileirao: 'Brasileirão',
  campeoes: 'Champions League',
  copa_mundo: 'Copa do Mundo',
};

const TeamDashboard = ({ idCartola, league }: { idCartola: string; league: string }) => {
  const { data, loading, error, valorizacaoLive, refetch } = useCartolaTeam(idCartola, league);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[520px] w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center">
          {error || 'Não foi possível carregar os dados do time.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <Header
        currentRound={data.mercado.rodada_atual}
        statusMercado={data.mercado.status_mercado}
        fechamento={data.mercado.fechamento}
        teamName={data.time.nome}
        cartoileiroName={data.time.cartoleiro}
        escudo={data.time.escudo}
        onRefresh={() => refetch(true)}
      />
      {data.mercado.status_mercado === 1 && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-sm bg-yellow-900/30 border border-yellow-700/40 px-3 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <p className="text-[11px] text-yellow-200">
            Mercado aberto — exibindo escalação da rodada anterior.
          </p>
        </div>
      )}
      <TeamInfoCard
        patrimony={data.time.patrimonio}
        valorizacao={data.time.valorizacao}
        roundPoints={data.time.pontos}
        totalPoints={data.time.pontos_total}
        partialRoundPoints={data.total_parcial}
        statusMercado={data.mercado.status_mercado}
        valorizacaoLive={valorizacaoLive}
      />
      <SoccerField players={data.titulares} capitaoId={data.capitao_id} reservaLuxoId={data.reserva_luxo_id} esquemaNome={data.esquema_nome} esquemaPosicoes={data.esquema_posicoes} statusMercado={data.mercado.status_mercado} rodadaAtual={data.mercado.rodada_atual} />
      <ReservesSection reserves={data.reservas} reservaLuxoId={data.reserva_luxo_id} statusMercado={data.mercado.status_mercado} />
    </>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { league, ready, clearLeague } = useAppLeague();
  const teams = useUserTeamsForLeague();
  const {
    data: marketData,
    isLoading: marketLoading,
  } = useMarketStatus(league ?? undefined);
  const marketStatus = marketData?.status_mercado ?? null;

  if (!ready || marketLoading) {
    return (
      <AppLayout>
        <div className="space-y-4 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppLayout>
    );
  }

  // Sem liga válida: redireciona em vez de cair em fallback "brasileirao"
  if (!league) {
    return <Navigate to="/league-select" replace />;
  }

  const handleSwitchLeague = () => {
    clearLeague();
    navigate('/league-select');
  };

  if (league === 'campeoes') {
    return (
      <AppLayout>
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-sm bg-card border border-border px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              Competição: <span className="text-foreground font-medium">Champions League</span>
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={handleSwitchLeague} className="h-7 px-2 text-xs">
            <ArrowRightLeft className="w-3 h-3 mr-1" />
            Trocar
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center px-6 py-16 gap-4 text-center">
          <Trophy className="w-12 h-12 text-primary" />
          <p className="text-sm text-foreground leading-relaxed max-w-sm">
            Temporada Champions 25/26 finalizada, obrigado a todos que participaram e espero vocês na próxima temporada!
          </p>
        </div>
      </AppLayout>
    );
  }

  if (league === 'copa_mundo' && marketStatus === 6) {
    return (
      <AppLayout>
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-sm bg-card border border-border px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              Competição: <span className="text-foreground font-medium">{LEAGUE_LABELS[league] || league}</span>
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={handleSwitchLeague} className="h-7 px-2 text-xs">
            <ArrowRightLeft className="w-3 h-3 mr-1" />
            Trocar
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center p-16 gap-4 text-center">
          <Trophy className="w-14 h-14 text-primary" />
          <p className="text-lg font-semibold text-foreground max-w-sm">
            Copa do Mundo de Seleções 2026 Finalizada!
          </p>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Obrigado pela participação de todos, nos vemos na Copa do Mundo de 2030!
          </p>
        </div>
      </AppLayout>
    );
  }

  if (marketStatus === 4) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center p-16 gap-4">
          <Wrench className="w-14 h-14 text-yellow-500" />
          <p className="text-lg font-semibold text-foreground">Mercado em Manutenção</p>
          <p className="text-sm text-muted-foreground text-center">
            Aguarde a reabertura do mercado.
          </p>
        </div>
      </AppLayout>
    );
  }




  const hasMultipleTeams = teams.length > 1;
  const activeLeague = league;

  return (
    <AppLayout>
      {/* Banner de competição — sempre visível acima do conteúdo */}
      <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-sm bg-card border border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground truncate">
            Competição: <span className="text-foreground font-medium">{LEAGUE_LABELS[activeLeague] || activeLeague}</span>
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={handleSwitchLeague} className="h-7 px-2 text-xs">
          <ArrowRightLeft className="w-3 h-3 mr-1" />
          Trocar
        </Button>
      </div>

      {hasMultipleTeams ? (
        <Tabs defaultValue={teams[0]?.id} className="w-full mt-3">
          <TabsList className="w-full mb-4">
            {teams.map((team) => (
              <TabsTrigger key={team.id} value={team.id} className="flex-1 text-xs">
                {team.team_name}
              </TabsTrigger>
            ))}
          </TabsList>
          {teams.map((team) => (
            <TabsContent key={team.id} value={team.id}>
              <TeamDashboard idCartola={team.id_cartola} league={activeLeague} />
            </TabsContent>
          ))}
        </Tabs>
      ) : teams.length === 1 ? (
        <TeamDashboard idCartola={teams[0].id_cartola} league={activeLeague} />
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-4">
          <p className="text-sm text-muted-foreground text-center">
            Nenhum time cadastrado nesta competição.
          </p>
          <Button variant="outline" onClick={handleSwitchLeague}>
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Trocar competição
          </Button>
        </div>
      )}
    </AppLayout>
  );
};

export default Dashboard;
