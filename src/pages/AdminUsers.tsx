import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, ArrowLeft, UserX, UserCheck, Trash2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AdminUser {
  user_id: string;
  email: string;
  role: string;
  deleted_at: string | null;
  email_confirmed_at: string | null;
  cartoleiro_name: string;
  team_name: string;
}

const AdminUsers = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
    'apikey': apiKey,
  });

  const fetchUsers = async () => {
    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/admin-users?action=list`,
        { headers: getHeaders() }
      );
      const data = await resp.json();
      if (resp.ok && data.users) {
        setUsers(data.users);
      } else {
        throw new Error(data.error || 'Erro ao carregar usuários');
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAction = async (action: 'deactivate' | 'reactivate', userId: string) => {
    setActionLoading(userId);
    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/admin-users?action=${action}`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ user_id: userId }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro');
      toast({ title: 'Sucesso', description: action === 'deactivate' ? 'Usuário desativado.' : 'Usuário reativado.' });
      await fetchUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
    setActionLoading(null);
  };

  const handleHardDelete = async () => {
    if (!hardDeleteTarget || confirmText !== 'EXCLUIR') return;
    setActionLoading(hardDeleteTarget.user_id);
    try {
      const resp = await fetch(
        `${baseUrl}/functions/v1/admin-users?action=hard-delete`,
        {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ user_id: hardDeleteTarget.user_id }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro');
      toast({ title: 'Sucesso', description: 'Usuário excluído permanentemente.' });
      setHardDeleteTarget(null);
      setConfirmText('');
      await fetchUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
    setActionLoading(null);
  };

  const getStatus = (user: AdminUser) => {
    if (user.deleted_at) return { label: 'Desativado', variant: 'destructive' as const };
    if (!user.email_confirmed_at) return { label: 'Email pendente', variant: 'secondary' as const };
    return { label: 'Ativo', variant: 'default' as const };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Usuários</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
        ) : (
          <div className="space-y-3">
            {users.map(user => {
              const status = getStatus(user);
              const isLoading = actionLoading === user.user_id;
              return (
                <Card key={user.user_id} className="glass-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.cartoleiro_name} • {user.team_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                          {user.role === 'admin' && (
                            <Badge variant="outline" className="text-xs border-primary text-primary">Admin</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {user.role !== 'admin' && (
                      <div className="flex gap-2 flex-wrap">
                        {!user.deleted_at ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction('deactivate', user.user_id)}
                            disabled={isLoading}
                            className="text-orange-500 border-orange-500 hover:bg-orange-500/10"
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserX className="w-3 h-3 mr-1" />}
                            Desativar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction('reactivate', user.user_id)}
                            disabled={isLoading}
                            className="text-green-500 border-green-500 hover:bg-green-500/10"
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserCheck className="w-3 h-3 mr-1" />}
                            Reativar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setHardDeleteTarget(user); setConfirmText(''); }}
                          disabled={isLoading}
                          className="text-destructive border-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={!!hardDeleteTarget} onOpenChange={(open) => { if (!open) { setHardDeleteTarget(null); setConfirmText(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="w-5 h-5" />
                Excluir permanentemente
              </DialogTitle>
              <DialogDescription>
                Esta ação é irreversível. O usuário <strong>{hardDeleteTarget?.email}</strong> será removido permanentemente do sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Digite <strong>EXCLUIR</strong> para confirmar:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                className="bg-secondary border-border"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setHardDeleteTarget(null); setConfirmText(''); }}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleHardDelete}
                disabled={confirmText !== 'EXCLUIR' || actionLoading === hardDeleteTarget?.user_id}
              >
                {actionLoading === hardDeleteTarget?.user_id ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Excluir permanentemente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AdminUsers;
