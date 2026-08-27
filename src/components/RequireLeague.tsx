import { Navigate, useLocation } from 'react-router-dom';
import { useAppLeague } from '@/contexts/AppLeagueContext';

const RequireLeague = ({ children }: { children: JSX.Element }) => {
  const { league, ready } = useAppLeague();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const publicRoutes = ['/league-select'];

  if (!league && !publicRoutes.includes(location.pathname)) {
    return <Navigate to="/league-select" replace />;
  }

  return children;
};

export default RequireLeague;
