import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Trophy, Medal, LogOut, Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLeague } from '@/contexts/AppLeagueContext';
import { cn } from '@/lib/utils';

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isAdmin } = useAuth();
  const { league } = useAppLeague();
  const [isMaintenance, setIsMaintenance] = useState(false);

  useEffect(() => {
    const checkMarket = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/cartola?action=market_status`);
        if (res.ok) {
          const data = await res.json();
          setIsMaintenance(data.status_mercado === 4);
        }
      } catch {
        // ignore
      }
    };
    checkMarket();
  }, []);

  const disabledPaths = ['/tournaments', '/league'];

  const isBrasileirao = league === 'brasileirao';

  const navItems = [
    { path: '/dashboard', label: 'Principal', icon: Home },
    { path: '/tournaments', label: 'Torneios', icon: Trophy },
    ...(isBrasileirao ? [{ path: '/league', label: 'Liga', icon: Medal }] : []),
    ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: Shield }] : []),
    { path: '/profile', label: 'Perfil', icon: User },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const isDisabled = isMaintenance && disabledPaths.includes(item.path);

          return (
            <button
              key={item.path}
              onClick={() => !isDisabled && navigate(item.path)}
              disabled={isDisabled}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full transition-colors',
                isDisabled
                  ? 'opacity-40 pointer-events-none'
                  : isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="w-5 h-5 mb-1" />
          <span className="text-xs font-medium">Sair</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
