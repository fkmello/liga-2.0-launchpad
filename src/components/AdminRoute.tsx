import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading, adminLoading } = useAuth();

  if (loading || adminLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default AdminRoute;
