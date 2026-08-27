import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trophy, Mail, ShieldX } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVerifyAlert, setShowVerifyAlert] = useState(false);
  const [showDeactivatedAlert, setShowDeactivatedAlert] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const { signIn, refreshUserTeams } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for deactivated account flag
  useEffect(() => {
    const deactivated = localStorage.getItem('accountDeactivated');
    if (deactivated) {
      setShowDeactivatedAlert(true);
      localStorage.removeItem('accountDeactivated');
    }
  }, []);

  // Clean up any stale verification flags
  useEffect(() => {
    localStorage.removeItem('pendingEmailVerification');
    localStorage.removeItem('pendingVerificationEmail');
  }, []);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      {
        toast({
          variant: 'destructive',
          title: 'Erro ao entrar',
          description: error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos'
            : error.message,
        });
      }
    } else {
      // Clear verification flags
      localStorage.removeItem('pendingEmailVerification');
      localStorage.removeItem('pendingVerificationEmail');

      // Check for pending invite code from registration
      const pendingCode = localStorage.getItem('pending_invite_code');
      if (pendingCode) {
        localStorage.removeItem('pending_invite_code');
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            const redeemResp = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-codes?action=redeem`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${sessionData.session.access_token}`,
                  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ code: pendingCode }),
              }
            );
            if (redeemResp.ok) {
              await refreshUserTeams();
              toast({
                title: 'Bem-vindo!',
                description: 'Login realizado e times vinculados com sucesso.',
              });
            } else {
              toast({
                title: 'Bem-vindo!',
                description: 'Login realizado, mas houve um erro ao vincular times.',
              });
            }
          }
        } catch {
          // Redeem failed silently
        }
      } else {
        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso.',
        });
      }
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md glass-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Trophy className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-gradient">
            Cartola Liga
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Entre para gerenciar sua liga
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showDeactivatedAlert && (
            <Alert className="mb-4 border-destructive bg-destructive/10">
              <ShieldX className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive">Conta desativada</AlertTitle>
              <AlertDescription className="text-muted-foreground">
                Sua conta foi desativada. Entre em contato com o administrador.
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-secondary border-border"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              <Link to="/forgot-password" className="text-primary hover:underline">
                Esqueci minha senha
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-primary hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
