import AppLayout from '@/components/layout/AppLayout';
import { Shield, Ticket, Users, Trophy, Medal, ChevronRight, RefreshCw, CheckCircle2, Clock, Zap, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const adminOptions = [
  { name: 'Códigos de Convite', icon: Ticket, path: '/admin/invite-codes' },
  { name: 'Gestão de Usuários', icon: Users, path: '/admin/users' },
  { name: 'Gerenciar Torneios', icon: Trophy, path: '/admin/tournaments' },
  { name: 'Liga Clássica', icon: Medal, path: '/admin/league' },
];

const typeLabels: Record<string, string> = {
  classificacao: 'Classificação',
  resultados: 'Resultados',
  dados_externos: 'Dados Externos',
  copa: 'Torneios',
};

type SyncScope = 'all' | 'league' | 'tournament' | 'smart' | 'rodada' | 'classificacao' | 'dados_externos' | 'confrontos' | 'ranking' | 'campeoes_all' | 'campeoes_rodada' | 'campeoes_dados_externos' | 'campeoes_fase_ko' | 'copa_mundo_all' | 'copa_mundo_rodada' | 'copa_mundo_dados_externos' | 'copa_mundo_fase_ko' | 'libertadores_dados_externos' | 'sulamericana_dados_externos' | 'liga_dados_externos';

const CAMPEOES_KO_FASES = ['Playoffs', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'] as const;
const COPA_MUNDO_KO_FASES = ['16avos', 'oitavas', 'quartas', 'semifinal', 'final'] as const;
const COPA_MUNDO_KO_LABELS: Record<string, string> = {
  '16avos': '16-avos de Final',
  oitavas: 'Oitavas de Final',
  quartas: 'Quartas de Final',
  semifinal: 'Semifinal',
  final: 'Final',
};

interface SyncCompleted {
  count: number;
  time: string;
}

interface MarketStatus {
  rodada_atual: number;
  status_mercado: number;
}

const COPA_RODADAS = [5, 7, 13, 16, 21, 22, 25, 26, 34, 35, 38];
const LIBERTA_SULA_RODADAS = [11, 12, 14, 15, 17, 18, 23, 24, 27, 28, 31, 32, 37];

function getSmartPreview(rodada: number): string[] {
  const items = ['Séries A, B e C (resultados + classificação)', 'Liga Clássica (ranking)'];
  if (COPA_RODADAS.includes(rodada)) items.push('Copa do Brasil');
  if (LIBERTA_SULA_RODADAS.includes(rodada)) items.push('Libertadores + Sulamericana');
  return items;
}

const SCOPE_NEEDS_LEAGUE: SyncScope[] = ['rodada', 'classificacao', 'dados_externos', 'confrontos'];
const SCOPE_NEEDS_RODADA: SyncScope[] = ['rodada', 'campeoes_rodada', 'copa_mundo_rodada'];
const SCOPE_CAMPEOES_RODADA: SyncScope[] = ['campeoes_rodada'];
const SCOPE_COPA_MUNDO_RODADA: SyncScope[] = ['copa_mundo_rodada'];

const Admin = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [smartSyncing, setSmartSyncing] = useState(false);
  const [scope, setScope] = useState<SyncScope>('all');
  const [league, setLeague] = useState('serie_a');
  const [tournament, setTournament] = useState('copa');
  const [rodada, setRodada] = useState('');
  const [campeoesFase, setCampeoesFase] = useState<string>('Playoffs');
  const [copaMundoFase, setCopaMundoFase] = useState<string>('16avos');
  const [syncExpanded, setSyncExpanded] = useState(false);
  const [lastSync, setLastSync] = useState<Record<string, string>>({});
  const [syncCompleted, setSyncCompleted] = useState<SyncCompleted | null>(null);
  const [market, setMarket] = useState<MarketStatus | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);

  const isMarketOpen = market?.status_mercado === 1;
  const smartRodada = market ? market.rodada_atual - 1 : null;

  const loadLastSync = useCallback(async () => {
    const { data } = await supabase
      .from('sheets_cache')
      .select('type, synced_at')
      .order('synced_at', { ascending: false });

    if (!data) return;

    const grouped: Record<string, string> = {};
    for (const row of data) {
      const t = row.type || 'outros';
      if (!grouped[t]) {
        grouped[t] = row.synced_at;
      }
    }
    setLastSync(grouped);
  }, []);

  const loadMarketStatus = useCallback(async () => {
    setMarketLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cartola?action=market_status`,
        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      if (res.ok) {
        const data = await res.json();
        setMarket(data);
      }
    } catch {
      // silently fail
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (syncExpanded) {
      loadLastSync();
      loadMarketStatus();
    }
  }, [syncExpanded, loadLastSync, loadMarketStatus]);

  const executeSync = async (params: Record<string, string>, setLoading: (v: boolean) => void) => {
    setLoading(true);
    setSyncCompleted(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const qs = new URLSearchParams(params).toString();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sheets?${qs}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

      const count = result.summary?.ok || 0;
      const now = new Date();
      setSyncCompleted({ count, time: format(now, 'HH:mm', { locale: ptBR }) });
      toast.success(`Sincronizado! ${count} chaves atualizadas.`);
      await loadLastSync();
    } catch (err: any) {
      toast.error(`Erro na sincronização: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSmartSync = () => {
    if (!smartRodada || smartRodada < 1) return;
    executeSync({ scope: 'smart', rodada: String(smartRodada) }, setSmartSyncing);
  };

  const handleManualSync = () => {
    const params: Record<string, string> = { scope };
    if (SCOPE_NEEDS_LEAGUE.includes(scope) || scope === 'league') {
      params.league = league;
    }
    if (SCOPE_NEEDS_RODADA.includes(scope) || (scope === 'league' && rodada)) {
      if (rodada) params.rodada = rodada;
    }
    if (scope === 'tournament') params.tournament = tournament;
    if (scope === 'campeoes_fase_ko') params.fase = campeoesFase;
    if (scope === 'copa_mundo_fase_ko') params.fase = copaMundoFase;
    if (scope === 'copa_mundo_rodada' && rodada) params.rodada = rodada;
    executeSync(params, setSyncing);
  };

  const formatSyncTime = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
    } catch {
      return iso;
    }
  };

  return (
    <AppLayout>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Painel Admin</h1>
        </div>

        <div className="space-y-3">
          {adminOptions.map((opt) => (
            <button
              key={opt.path}
              onClick={() => navigate(opt.path)}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <opt.icon className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">{opt.name}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}

          {/* Sync Section */}
          <button
            onClick={() => setSyncExpanded(!syncExpanded)}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-foreground">Sincronizar Dados</span>
            </div>
            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${syncExpanded ? 'rotate-90' : ''}`} />
          </button>

          {syncExpanded && (
            <div className="p-4 rounded-lg bg-card border border-border space-y-4">
              {/* Market Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status do Mercado</span>
                {marketLoading ? (
                  <Badge variant="outline" className="text-xs">Carregando...</Badge>
                ) : market ? (
                  <Badge variant={isMarketOpen ? 'default' : 'secondary'} className={isMarketOpen ? 'bg-green-500/20 text-green-500 border-green-500/30' : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'}>
                    {isMarketOpen ? `Mercado Aberto — Rodada ${market.rodada_atual}` : `Rodada ${market.rodada_atual} em andamento`}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Indisponível</Badge>
                )}
              </div>

              {/* Smart Sync Button */}
              {market && (
                <div className="space-y-2">
                  <Button
                    onClick={handleSmartSync}
                    disabled={smartSyncing || !isMarketOpen || !smartRodada || smartRodada < 1}
                    className="w-full"
                    variant={isMarketOpen ? 'default' : 'secondary'}
                  >
                    {smartSyncing ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 mr-2" />
                    )}
                    {smartSyncing
                      ? 'Sincronizando...'
                      : isMarketOpen
                        ? `Sincronizar Rodada ${smartRodada}`
                        : `Rodada ${market.rodada_atual} em andamento`
                    }
                  </Button>

                  {/* Smart preview */}
                  {isMarketOpen && smartRodada && smartRodada >= 1 && (
                    <div className="text-xs text-muted-foreground space-y-1 pl-1">
                      <p className="font-medium">Será sincronizado:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {getSmartPreview(smartRodada).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Sync completed banner */}
              {syncCompleted && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span className="text-xs text-green-500 font-medium">
                    Sincronização concluída — {syncCompleted.count} chaves atualizadas às {syncCompleted.time}
                  </span>
                </div>
              )}

              <Separator />

              {/* Manual sync controls */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sincronização manual</p>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Escopo</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as SyncScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tudo</SelectItem>
                    <SelectItem value="league">Liga completa</SelectItem>
                    <SelectItem value="classificacao">Apenas classificação</SelectItem>
                    <SelectItem value="rodada">Apenas uma rodada</SelectItem>
                    <SelectItem value="dados_externos">Dados externos</SelectItem>
                    <SelectItem value="confrontos">Confrontos (todas rodadas)</SelectItem>
                    <SelectItem value="tournament">Torneio</SelectItem>
                    <SelectItem value="ranking">Liga Clássica (ranking)</SelectItem>
                    <SelectItem value="campeoes_all">Champions: Tudo (rebuild completo)</SelectItem>
                    <SelectItem value="campeoes_rodada">Champions: Rodada Fase de Liga (1-8)</SelectItem>
                    <SelectItem value="campeoes_fase_ko">Champions: Fase Mata-Mata (rodada atual)</SelectItem>
                    <SelectItem value="campeoes_dados_externos">Champions: Dados Externos</SelectItem>
                    <SelectItem value="copa_mundo_all">Copa do Mundo: Tudo (rebuild completo)</SelectItem>
                    <SelectItem value="copa_mundo_rodada">Copa do Mundo: Rodada Fase de Grupos</SelectItem>
                    <SelectItem value="copa_mundo_fase_ko">Copa do Mundo: Fase Mata-Mata</SelectItem>
                    <SelectItem value="copa_mundo_dados_externos">Copa do Mundo: Dados Externos</SelectItem>
                    <SelectItem value="libertadores_dados_externos">Libertadores: Dados Externos</SelectItem>
                    <SelectItem value="sulamericana_dados_externos">Sulamericana: Dados Externos</SelectItem>
                    <SelectItem value="liga_dados_externos">Liga Clássica: Dados Externos</SelectItem>

                  </SelectContent>
                </Select>
              </div>

              {/* Warning for confrontos */}
              {scope === 'confrontos' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-yellow-500 font-medium">
                    Esta opção recarrega todas as 38 rodadas — uso apenas em configuração inicial ou reset
                  </span>
                </div>
              )}

              {/* League selector */}
              {(SCOPE_NEEDS_LEAGUE.includes(scope) || scope === 'league') && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Liga</Label>
                  <Select value={league} onValueChange={setLeague}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serie_a">Série A</SelectItem>
                      <SelectItem value="serie_b">Série B</SelectItem>
                      <SelectItem value="serie_c">Série C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Rodada input */}
              {(SCOPE_NEEDS_RODADA.includes(scope) || scope === 'league') && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {scope === 'rodada' ? 'Rodada (obrigatório, 1-38)' : SCOPE_CAMPEOES_RODADA.includes(scope) ? 'Rodada Fase de Liga (obrigatório, 1-8)' : 'Até rodada (opcional)'}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={SCOPE_CAMPEOES_RODADA.includes(scope) ? 8 : 38}
                    placeholder={scope === 'rodada' ? 'Ex: 8' : SCOPE_CAMPEOES_RODADA.includes(scope) ? 'Ex: 3' : 'Todas'}
                    value={rodada}
                    onChange={(e) => setRodada(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}

              {/* Tournament selector */}
              {scope === 'tournament' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Torneio</Label>
                  <Select value={tournament} onValueChange={setTournament}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="copa">Copa do Brasil</SelectItem>
                      <SelectItem value="libertadores">Libertadores</SelectItem>
                      <SelectItem value="sulamericana">Sulamericana</SelectItem>
                      <SelectItem value="intercontinental">Intercontinental</SelectItem>
                      <SelectItem value="campeoes">Champions League</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Champions KO phase selector */}
              {scope === 'campeoes_fase_ko' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fase do Mata-Mata</Label>
                  <Select value={campeoesFase} onValueChange={setCampeoesFase}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAMPEOES_KO_FASES.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Atualiza apenas a fase escolhida + classificação. Use isto para sincronizar a rodada atual da Champions sem refazer a Fase de Liga.
                  </p>
                </div>
              )}

              {/* Copa do Mundo KO phase selector */}
              {scope === 'copa_mundo_fase_ko' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Fase do Mata-Mata (Copa do Mundo)</Label>
                  <Select value={copaMundoFase} onValueChange={setCopaMundoFase}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COPA_MUNDO_KO_FASES.map((f) => (
                        <SelectItem key={f} value={f}>{COPA_MUNDO_KO_LABELS[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Atualiza apenas a fase escolhida + classificação da Copa do Mundo.
                  </p>
                </div>
              )}

              <Button
                onClick={handleManualSync}
                disabled={syncing || ((scope === 'rodada' || scope === 'campeoes_rodada' || scope === 'copa_mundo_rodada') && !rodada) || (scope === 'campeoes_fase_ko' && !campeoesFase) || (scope === 'copa_mundo_fase_ko' && !copaMundoFase)}
                variant="outline"
                className="w-full"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>

              {/* Last sync timestamps */}
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Última sincronização</p>
                {Object.keys(typeLabels).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{typeLabels[type]}</span>
                    <span className="text-xs text-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {lastSync[type] ? formatSyncTime(lastSync[type]) : 'Nunca'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Admin;
