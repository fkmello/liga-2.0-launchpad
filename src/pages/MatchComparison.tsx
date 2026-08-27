import { useSearchParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMatchComparison } from '@/hooks/useMatchComparison';
import PlayerComparisonCard from '@/components/tournaments/PlayerComparisonCard';
import {
  groupByPosition,
  alignPlayersByPosition,
  getSharedPlayerIds,
  POSITION_ORDER,
  POSITION_LABELS,
  NormalizedPlayer,
} from '@/utils/matchComparison';
import { useMemo } from 'react';

const MatchComparison = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const id1 = searchParams.get('id1');
  const id2 = searchParams.get('id2');
  const rodada = searchParams.get('rodada') ? Number(searchParams.get('rodada')) : null;
  const statusMercado = searchParams.get('statusMercado') ? Number(searchParams.get('statusMercado')) : null;
  const slug = searchParams.get('slug');
  const league = searchParams.get('league');

  const fase = searchParams.get('fase');
  const rodadaGrupos = searchParams.get('rodadaGrupos');
  const tab = searchParams.get('tab');

  const handleBack = () => {
    if (slug) {
      const params = new URLSearchParams();
      params.set('tab', tab || 'confrontos');
      if (rodada) params.set('rodadaInicial', String(rodada));
      if (fase) params.set('fase', fase);
      if (fase === 'Fase de Grupos' && rodadaGrupos) params.set('rodadaGrupos', rodadaGrupos);
      navigate(`/tournaments/${slug}?${params.toString()}`);
    } else {
      navigate(-1);
    }
  };

  const { data, isLoading, error } = useMatchComparison(id1, id2, rodada, statusMercado, league);

  const sharedIds = useMemo(() => {
    if (!data) return { sharedTitulares: new Set<number>(), sharedReservas: new Set<number>() };
    const sharedTitulares = getSharedPlayerIds(data.team1.titulares, data.team2.titulares);
    const sharedReservas = getSharedPlayerIds(data.team1.reservas, data.team2.reservas);
    return { sharedTitulares, sharedReservas };
  }, [data]);

  const team1Groups = useMemo(() => data ? groupByPosition(data.team1.titulares) : null, [data]);
  const team2Groups = useMemo(() => data ? groupByPosition(data.team2.titulares) : null, [data]);

  const playedCounts = useMemo(() => {
    if (!data) return { team1: 0, team2: 0 };
    const count = (players: NormalizedPlayer[]) => players.filter(p => p.game_status !== 'not_started').length;
    return { team1: count(data.team1.titulares), team2: count(data.team2.titulares) };
  }, [data]);

  const renderPositionSection = (
    posId: number,
    t1Players: NormalizedPlayer[],
    t2Players: NormalizedPlayer[]
  ) => {
    if (t1Players.length === 0 && t2Players.length === 0) return null;
    const { left, right } = alignPlayersByPosition(t1Players, t2Players);

    return (
      <div key={posId} className="space-y-1">
        <div className="text-center">
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
            {POSITION_LABELS[posId]}
          </span>
        </div>
        {left.map((lp, i) => {
          const rp = right[i];
          return (
            <div key={i} className="grid grid-cols-2 gap-1.5">
              <div>
                {lp ? (
                  <PlayerComparisonCard
                    player={lp}
                    isRepeated={sharedIds.sharedTitulares.has(lp.id)}
                    align="left"
                    statusMercado={statusMercado}
                  />
                ) : (
                  <div className="h-10" />
                )}
              </div>
              <div>
                {rp ? (
                  <PlayerComparisonCard
                    player={rp}
                    isRepeated={sharedIds.sharedTitulares.has(rp.id)}
                    align="right"
                    statusMercado={statusMercado}
                  />
                ) : (
                  <div className="h-10" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReservesSection = () => {
    if (!data) return null;
    const r1 = data.team1.reservas;
    const r2 = data.team2.reservas;
    if (r1.length === 0 && r2.length === 0) return null;

    const POSITIONS = [1, 2, 3, 4, 5]; // GOL, LAT, ZAG, MEI, ATA
    const rows: { left: typeof r1[number] | null; right: typeof r2[number] | null }[] = [];
    for (const pos of POSITIONS) {
      const l = r1.filter(p => p.posicao_id === pos);
      const r = r2.filter(p => p.posicao_id === pos);
      const n = Math.max(l.length, r.length, 1);
      for (let i = 0; i < n; i++) {
        rows.push({ left: l[i] ?? null, right: r[i] ?? null });
      }
    }

    return (
      <div className="space-y-1">
        <div className="text-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            RESERVAS
          </span>
        </div>
        {rows.map(({ left: lp, right: rp }, i) => (
          <div key={i} className="grid grid-cols-2 gap-1.5">
            <div>
              {lp ? (
                <PlayerComparisonCard
                  player={lp}
                  isRepeated={sharedIds.sharedReservas.has(lp.id)}
                  align="left"
                  statusMercado={statusMercado}
                />
              ) : (
                <div className="h-10" />
              )}
            </div>
            <div>
              {rp ? (
                <PlayerComparisonCard
                  player={rp}
                  isRepeated={sharedIds.sharedReservas.has(rp.id)}
                  align="right"
                  statusMercado={statusMercado}
                />
              ) : (
                <div className="h-10" />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };


  return (
    <AppLayout>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-sm font-bold text-foreground">Comparar pontuação</h1>
          {rodada && (
            <span className="text-xs text-muted-foreground ml-auto">
              Rodada {rodada}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando dados...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">Erro: {(error as Error).message}</p>
          </div>
        )}

        {/* Content */}
        {data && (
          <div className="space-y-4">
            {/* Score header */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-center gap-2">

                {/* Team 1 */}
                <div className="flex flex-col items-center w-24">
                  <div className="w-12 h-12 flex items-center justify-center">
                    {data.team1.escudo ? (
                      <img src={data.team1.escudo} alt={data.team1.nome} className="w-12 h-12 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted" />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-foreground text-center leading-tight mt-1 truncate w-full">
                    {data.team1.nome}
                  </span>
                  <span className="text-[9px] text-muted-foreground text-center truncate w-full">
                    {data.team1.cartoleiro}
                  </span>
                </div>

                {/* Score */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    {statusMercado === 2 && (
                      <span className="text-[9px] font-medium text-muted-foreground mb-0.5">
                        {playedCounts.team1}/12
                      </span>
                    )}
                    <span className="text-2xl font-black text-foreground">
                      {data.team1.pontos.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground font-bold">x</span>
                  <div className="flex flex-col items-center">
                    {statusMercado === 2 && (
                      <span className="text-[9px] font-medium text-muted-foreground mb-0.5">
                        {playedCounts.team2}/12
                      </span>
                    )}
                    <span className="text-2xl font-black text-foreground">
                      {data.team2.pontos.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Team 2 */}

                <div className="flex flex-col items-center w-24">
                  <div className="w-12 h-12 flex items-center justify-center">
                    {data.team2.escudo ? (
                      <img src={data.team2.escudo} alt={data.team2.nome} className="w-12 h-12 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted" />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-foreground text-center leading-tight mt-1 truncate w-full">
                    {data.team2.nome}
                  </span>
                  <span className="text-[9px] text-muted-foreground text-center truncate w-full">
                    {data.team2.cartoleiro}
                  </span>
                </div>

              </div>
            </div>

            {/* Player comparison by position */}
            <div className="space-y-3">
              {team1Groups && team2Groups && POSITION_ORDER.map(posId =>
                renderPositionSection(
                  posId,
                  team1Groups.get(posId) || [],
                  team2Groups.get(posId) || []
                )
              )}

              {/* Divider before reserves */}
              <div className="border-t border-border/50 my-2" />

              {renderReservesSection()}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default MatchComparison;
