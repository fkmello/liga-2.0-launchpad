import { useMemo } from 'react';
import { useTournamentFinished } from '@/hooks/useTournamentFinished';
import { useClassificacao, useDadosExternos } from '@/hooks/useGoogleSheets';
import { Loader2, AlertCircle } from 'lucide-react';
import LegacyClassificacaoTable from './LegacyClassificacaoTable';
import StandingsTable from './StandingsTable';

interface ClassificacaoTableProps {
  league?: string;
  isUserTeam?: (name: string) => boolean;
  statusMercado?: number;
}

const LEAGUE_TO_SLUG: Record<string, string> = {
  serie_a: 'brasileirao-serie-a',
  serie_b: 'brasileirao-serie-b',
  serie_c: 'brasileirao-serie-c',
};

const ClassificacaoTable = ({ league = 'serie_a', isUserTeam, statusMercado }: ClassificacaoTableProps) => {
  const { standings, legacy, isLoading, error } = useClassificacao(league);
  const { data: dadosExternos } = useDadosExternos(league);
  const { finished } = useTournamentFinished(LEAGUE_TO_SLUG[league]);

  // Build badge URL mapping from dados externos
  const badgeUrls = useMemo(() => {
    if (!dadosExternos?.rows) return {};
    const mapping: Record<string, string> = {};
    for (const row of dadosExternos.rows) {
      const name = row[0]?.trim();
      const url = row[3]?.trim();
      if (name && url && url.startsWith('http')) {
        mapping[name] = url;
        mapping[name.toUpperCase()] = url;
      }
    }
    return mapping;
  }, [dadosExternos]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando classificação...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
        <p className="text-sm text-destructive">Erro ao carregar classificação: {error.message}</p>
      </div>
    );
  }

  if (standings) {
    return (
      <StandingsTable
        rows={standings}
        badgeUrls={badgeUrls}
        league={league}
        finished={finished}
        isUserTeam={isUserTeam}
        statusMercado={statusMercado}
      />
    );
  }

  return (
    <LegacyClassificacaoTable
      data={legacy}
      badgeUrls={badgeUrls}
      league={league}
      finished={finished}
      isUserTeam={isUserTeam}
      statusMercado={statusMercado}
    />
  );
};

export default ClassificacaoTable;
