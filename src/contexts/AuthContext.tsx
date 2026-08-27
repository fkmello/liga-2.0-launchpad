import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile, UserTeam } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  adminLoading: boolean;
  userTeams: UserTeam[];
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUserTeams: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [userTeams, setUserTeams] = useState<UserTeam[]>([]);

  const fetchProfile = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!error && data) {
      if (data.deleted_at) {
        localStorage.setItem('accountDeactivated', 'true');
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsAdmin(false);
        setAdminLoading(false);
        setUserTeams([]);
        return false;
      }
      setProfile(data as Profile);
    }
    return true;
  };

  const fetchAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!data);
    setAdminLoading(false);
  };

  const fetchUserTeams = async (userId: string) => {
    const { data } = await supabase
      .from('user_teams')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setUserTeams((data as UserTeam[]) || []);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const refreshUserTeams = async () => {
    if (user) {
      await fetchUserTeams(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setAdminLoading(true);
          setTimeout(async () => {
            const isActive = await fetchProfile(session.user.id);
            if (isActive) {
              fetchAdminStatus(session.user.id);
              fetchUserTeams(session.user.id);
            }
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setAdminLoading(false);
          setUserTeams([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const isActive = await fetchProfile(session.user.id);
        if (isActive) {
          fetchAdminStatus(session.user.id);
          fetchUserTeams(session.user.id);
        }
      } else {
        setAdminLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setAdminLoading(false);
    setUserTeams([]);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      isAdmin,
      adminLoading,
      userTeams,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshUserTeams,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
