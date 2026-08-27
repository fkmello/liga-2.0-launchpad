import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check, ArrowLeft } from 'lucide-react';
import { InviteCode } from '@/types';
import { useNavigate } from 'react-router-dom';

interface TeamOption {
  team_name: string;
  id_cartola: string;
  serie: string;
}

const AdminInviteCodes = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);

  const teamsWithInvite = useMemo(() => {
    const set = new Set<string>();
    codes.forEach(code => {
      const teamData = code.team_data as Array<{ id_cartola: string }>;
      if (Array.isArray(teamData)) {
        teamData.forEach(t => set.add(t.id_cartola));
      }
    });
    return set;
  }, [codes]);

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey': apiKey,
  };

  useEffect(() => {
    fetchTeams();
    fetchCodes();
  }, []);

  const fetchTeams = async () => {
    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/google-sheets?action=dados_gerais_times`,
        { headers: authHeaders }
      );
      const data = await resp.json();
      if (data.teams) setTeams(data.teams);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao carregar times.' });
    }
    setLoadingTeams(false);
  };

  const fetchCodes = async () => {
    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/invite-codes?action=list`,
        { headers: authHeaders }
      );
      const data = await resp.json();
      if (data.codes) setCodes(data.codes);
    } catch (err) {
      console.error(err);
    }
    setLoadingCodes(false);
  };

  const toggleTeam = (idCartola: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(idCartola)) next.delete(idCartola);
      else next.add(idCartola);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedTeams.size === 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione pelo menos um time.' });
      return;
    }

    setGenerating(true);
    setGeneratedCode(null);

    const teamData = teams
      .filter(t => selectedTeams.has(t.id_cartola))
      .map(t => ({ team_name: t.team_name, id_cartola: t.id_cartola, serie: t.serie }));

    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/invite-codes?action=generate`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ team_data: teamData }),
        }
      );
      const data = await resp.json();
      if (resp.ok) {
        setGeneratedCode({ code: data.code, expires_at: data.expires_at });
        setSelectedTeams(new Set());
        fetchCodes();
        toast({ title: 'Código gerado!', description: `Código: ${data.code}` });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao gerar código.' });
    }
    setGenerating(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copiado!', description: 'Código copiado para a área de transferência.' });
  };

  const getCodeStatus = (code: InviteCode): { label: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (code.used_at) return { label: 'Usado', variant: 'secondary' };
    if (new Date(code.expires_at) < new Date()) return { label: 'Expirado', variant: 'destructive' };
    return { label: 'Disponível', variant: 'default' };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Códigos de Convite</h1>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Gerar Código de Convite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingTeams ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                {teams.map(team => {
                  const hasInvite = teamsWithInvite.has(team.id_cartola);
                  return (
                  <label
                    key={team.id_cartola}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                      hasInvite
                        ? 'bg-green-500/15 border-green-400/30 hover:bg-green-500/20'
                        : 'border-transparent hover:bg-secondary/50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedTeams.has(team.id_cartola)}
                      onCheckedChange={() => toggleTeam(team.id_cartola)}
                    />
                    <span className="text-sm text-foreground flex-1">{team.team_name}</span>
                    {hasInvite && (
                      <Badge variant="outline" className="text-xs border-green-400/50 text-green-400">Convite gerado</Badge>
                    )}
                    {team.serie && (
                      <Badge variant="outline" className="text-xs">{team.serie}</Badge>
                    )}
                  </label>
                  );
                })}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || selectedTeams.size === 0}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                `Gerar Código (${selectedTeams.size} time${selectedTeams.size !== 1 ? 's' : ''})`
              )}
            </Button>

            {generatedCode && (
              <div className="p-4 rounded-lg bg-secondary border border-border text-center space-y-2">
                <p className="text-xs text-muted-foreground">Código gerado:</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                    {generatedCode.code}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyCode(generatedCode.code)}
                  >
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Expira em: {new Date(generatedCode.expires_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Códigos Gerados</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCodes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : codes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum código gerado ainda.</p>
            ) : (
              <div className="space-y-3">
                {codes.map(code => {
                  const status = getCodeStatus(code);
                  const teamNames = (code.team_data as Array<{ team_name: string }>)
                    .map(t => t.team_name)
                    .join(', ');
                  return (
                    <div
                      key={code.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm tracking-wider">{code.code}</span>
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{teamNames}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => copyCode(code.code)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminInviteCodes;
