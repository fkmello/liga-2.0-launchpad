import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "Password is known to be weak": "Esta senha foi encontrada em vazamentos de dados. Escolha uma senha diferente.",
  "User already registered": "Este email já está cadastrado.",
  "Password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres.",
  "Unable to validate email address: invalid format": "Formato de email inválido.",
  "Signup requires a valid password": "Informe uma senha válida.",
  "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

const translateAuthError = (message: string): string => {
  const lowerMessage = message.toLowerCase();
  const match = Object.entries(AUTH_ERROR_MESSAGES).find(([key]) => 
    lowerMessage.includes(key.toLowerCase())
  );
  return match ? match[1] : "Ocorreu um erro no cadastro. Tente novamente.";
};

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'As senhas não coincidem',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres',
      });
      return;
    }

    if (!inviteCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Informe o código de convite',
      });
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Validate invite code
      const { data: validateData, error: validateError } = await supabase.functions.invoke('invite-codes', {
        body: null,
        headers: {},
      });

      // Use fetch directly for GET with query params
      const validateResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-codes?action=validate&code=${inviteCode.trim().toUpperCase()}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const validateResult = await validateResp.json();

      if (!validateResult.valid) {
        const messages: Record<string, string> = {
          CODE_NOT_FOUND: 'Código de convite não encontrado.',
          CODE_ALREADY_USED: 'Este código já foi utilizado.',
          CODE_EXPIRED: 'Este código expirou.',
        };
        toast({
          variant: 'destructive',
          title: 'Código inválido',
          description: messages[validateResult.reason] || 'Código inválido.',
        });
        setIsLoading(false);
        return;
      }

      // Step 2: Create account
      const { error: signUpError } = await signUp(email, password);

      if (signUpError) {
        toast({
          variant: 'destructive',
          title: 'Erro ao cadastrar',
          description: translateAuthError(signUpError.message),
        });
        setIsLoading(false);
        return;
      }

      // Step 3: Save code to localStorage for redemption after login
      localStorage.setItem('pending_invite_code', inviteCode.trim().toUpperCase());

      toast({
        title: 'Cadastro realizado!',
        description: 'Faça login para acessar sua conta e vincular seus times.',
      });
      navigate('/login');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro inesperado. Tente novamente.',
      });
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
            Criar Conta
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Use seu código de convite para se cadastrar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Código de Convite</Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="Ex: ABCD1234"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                required
                maxLength={8}
                className="bg-secondary border-border uppercase tracking-widest text-center font-mono text-lg"
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirme sua senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Cadastrando...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Register;
