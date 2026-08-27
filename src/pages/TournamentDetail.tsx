import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { ArrowLeft, Trophy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import RoundMatches from '@/components/tournaments/RoundMatches';
import ClassificacaoTable from '@/components/tournaments/ClassificacaoTable';
import CupRoundMatches from '@/components/tournaments/CupRoundMatches';
import LibertadoresView from '@/components/tournaments/LibertadoresView';
import SulamericanaView from '@/components/tournaments/SulamericanaView';
import IntercontinentalView from '@/components/tournaments/IntercontinentalView';
import ChampionsLeagueView from '@/components/tournaments/ChampionsLeagueView';
import CopaMundoView from '@/components/tournaments/CopaMundoView';
import { useUserTeamNames } from '@/hooks/useUserTeamNames';
import { useUserTeamsForLeague } from '@/hooks/useUserTeamsForLeague';
import { useCartolaTeam } from '@/hooks/useCartolaTeam';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { useAppLeague } from '@/contexts/AppLeagueContext';
import { LEAGUE_SLUGS } from '@/config/leagueSlugs';

// Slugs cujo `mercado` deve vir de um endpoint isolado da API Cartola.
const tournamentLeague: Record<string, string> = {
  'champions-league': 'campeoes',
  'copa-do-mundo': 'copa_mundo',
};

const tournamentNames: Record<string, string> = {
  'brasileirao-serie-a': 'BRASILEIRÃO Série A',
  'brasileirao-serie-b': 'BRASILEIRÃO Série B',
  'brasileirao-serie-c': 'BRASILEIRÃO Série C',
  'copa-do-brasil': 'COPA DO BRASIL',
  'libertadores': 'LIBERTADORES',
  'sulamericana': 'SULAMERICANA',
  'copa-intercontinental': 'COPA INTERCONTINENTAL',
  'champions-league': 'CHAMPIONS LEAGUE',
  'copa-do-mundo': 'COPA DO MUNDO FIFA',
};

const hasTabs = ['brasileirao-serie-a', 'brasileirao-serie-b', 'brasileirao-serie-c'];

const slugToLeague: Record<string, string> = {
  'brasileirao-serie-a': 'serie_a',
  'brasileirao-serie-b': 'serie_b',
  'brasileirao-serie-c': 'serie_c',
  'copa-do-brasil': 'copa_brasil',
};

const TournamentDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || 'classificacao';
  const rodadaInicial = searchParams.get('rodadaInicial') ? Number(searchParams.get('rodadaInicial')) : undefined;
  const { isUserTeam } = useUserTeamNames();
  const { league } = useAppLeague();
  const teams = useUserTeamsForLeague();
  const idCartola = teams[0]?.id_cartola;

  // Liga do Cartola para buscar dados do time (campeoes ou brasileirao)
  const cartolaLeague = league === 'campeoes' ? 'campeoes' : 'brasileirao';
  const { data: cartolaData } = useCartolaTeam(idCartola, cartolaLeague);

  // Guards: aguardar contexto e validar slug pertence à liga
  if (!league) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        Carregando...
      </div>
    );
  }
  const allowedSlugs = LEAGUE_SLUGS[league];
  if (slug && !allowedSlugs.includes(slug)) {
    return <Navigate to="/tournaments" replace />;
  }

  const name = tournamentNames[slug || ''] || 'Torneio';
  const showTabs = hasTabs.includes(slug || '');
  const isCup = slug === 'copa-do-brasil';
  const isLibertadores = slug === 'libertadores';
  const isSulamericana = slug === 'sulamericana';
  const isIntercontinental = slug === 'copa-intercontinental';
  const isChampions = slug === 'champions-league';
  const isCopaMundo = slug === 'copa-do-mundo';
  const hasData = !!slugToLeague[slug || ''] || isLibertadores || isSulamericana || isIntercontinental || isChampions || isCopaMundo;
  const leagueParam = slugToLeague[slug || ''] || 'serie_a';
  const tournamentLeagueKey = tournamentLeague[slug || ''];
  const { data: marketData } = useMarketStatus(tournamentLeagueKey);
  const rodadaBase = tournamentLeagueKey
    ? marketData?.rodada_atual
    : cartolaData?.mercado?.rodada_atual;
  const statusMercado = tournamentLeagueKey
    ? marketData?.status_mercado
    : cartolaData?.mercado?.status_mercado;

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tournaments')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Trophy className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">{name}</h1>
        </div>

        {isCopaMundo ? (
          <CopaMundoView isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} initialRodadaGrupos={searchParams.get('rodadaGrupos') ? Number(searchParams.get('rodadaGrupos')) : undefined} />
        ) : isChampions ? (
          <ChampionsLeagueView isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} initialRodadaLiga={searchParams.get('rodadaLiga') ? Number(searchParams.get('rodadaLiga')) : undefined} />
        ) : isIntercontinental ? (
          <IntercontinentalView isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} />
        ) : isSulamericana ? (
          <SulamericanaView isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} initialRodadaGrupos={searchParams.get('rodadaGrupos') ? Number(searchParams.get('rodadaGrupos')) : undefined} />
        ) : isLibertadores ? (
          <LibertadoresView isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} initialRodadaGrupos={searchParams.get('rodadaGrupos') ? Number(searchParams.get('rodadaGrupos')) : undefined} />
        ) : isCup ? (
          <CupRoundMatches isUserTeam={isUserTeam} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} initialFase={searchParams.get('fase') || undefined} />
        ) : showTabs && hasData ? (
          <Tabs defaultValue={tabParam} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="classificacao" className="flex-1">Classificação</TabsTrigger>
              <TabsTrigger value="confrontos" className="flex-1">Confrontos</TabsTrigger>
            </TabsList>
            <TabsContent value="classificacao">
              <ClassificacaoTable league={leagueParam} isUserTeam={isUserTeam} statusMercado={statusMercado} />
            </TabsContent>
            <TabsContent value="confrontos">
              <RoundMatches league={leagueParam} isUserTeam={isUserTeam} rodadaAtual={rodadaInicial ?? rodadaBase} rodadaBase={rodadaBase} statusMercado={statusMercado} slug={slug} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Clock className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">Em breve</p>
            <p className="text-xs mt-1">Os dados deste torneio serão adicionados em breve.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TournamentDetail;
