import { useState, useEffect } from 'react';
import { Download, Share, MoreVertical, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle className="w-16 h-16 text-primary mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">App instalado!</h1>
        <p className="text-muted-foreground">Você já pode acessar o Liga Jacarandás pela tela inicial.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <img src="/pwa-192x192.png" alt="Liga Jacarandás" className="w-24 h-24 rounded-2xl mb-6" />
      <h1 className="text-2xl font-bold text-foreground mb-2">Instalar Liga Jacarandás</h1>
      <p className="text-muted-foreground mb-8 max-w-sm">
        Instale o app no seu celular para acesso rápido, como um app nativo.
      </p>

      {deferredPrompt && (
        <Button onClick={handleInstall} size="lg" className="mb-6 gap-2">
          <Download className="w-5 h-5" />
          Instalar agora
        </Button>
      )}

      {isIOS && (
        <div className="bg-card border border-border rounded-xl p-5 max-w-sm text-left space-y-3">
          <p className="text-sm font-semibold text-foreground">No iPhone / iPad:</p>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Share className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
            <span>Toque no ícone <strong>Compartilhar</strong> na barra do Safari</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Download className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
            <span>Selecione <strong>"Adicionar à Tela de Início"</strong></span>
          </div>
        </div>
      )}

      {!isIOS && !deferredPrompt && (
        <div className="bg-card border border-border rounded-xl p-5 max-w-sm text-left space-y-3">
          <p className="text-sm font-semibold text-foreground">No Android:</p>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <MoreVertical className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
            <span>Toque no menu <strong>⋮</strong> do navegador</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Download className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
            <span>Selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Install;
