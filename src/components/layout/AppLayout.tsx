import { ReactNode } from 'react';
import BottomNav from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="max-w-lg mx-auto">
        {children}
      </main>
      <p className="py-2 text-center text-[10px] text-muted-foreground/40">
        v{__APP_VERSION__}
      </p>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
