import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLeague } from '@/contexts/AppLeagueContext';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Mail, ArrowRightLeft } from 'lucide-react';

const Profile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clearLeague } = useAppLeague();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSwitchLeague = () => {
    clearLeague();
    navigate('/league-select');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Erro', description: 'A senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Erro', description: 'As senhas não coincidem.' });
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao alterar senha', description: error.message });
    } else {
      toast({ title: 'Sucesso!', description: 'Sua senha foi alterada com sucesso.' });
      setNewPassword('');
      setConfirmPassword('');
    }

    setIsLoading(false);
  };

  return (
    <AppLayout>
      <div className="container max-w-md mx-auto py-8 px-4">
        <Card className="glass-card">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl font-bold">Meu Perfil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4" />
              <span>{user?.email}</span>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="text-lg font-semibold">Alterar Senha</h3>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  'Alterar Senha'
                )}
              </Button>
            </form>

            <div className="pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleSwitchLeague}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Trocar competição
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Profile;
