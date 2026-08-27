import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppLeague = 'brasileirao' | 'campeoes' | 'copa_mundo';

const VALID_LEAGUES: AppLeague[] = ['brasileirao', 'campeoes', 'copa_mundo'];
const STORAGE_KEY = 'app_league';

interface AppLeagueContextType {
  league: AppLeague | null;
  setLeague: (league: AppLeague) => void;
  clearLeague: () => void;
  ready: boolean;
}

const AppLeagueContext = createContext<AppLeagueContextType | undefined>(undefined);

const readStoredLeague = (): AppLeague | null => {
  try {
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    if (fromLocal && VALID_LEAGUES.includes(fromLocal as AppLeague)) {
      return fromLocal as AppLeague;
    }
  } catch {
    /* noop */
  }
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (fromSession && VALID_LEAGUES.includes(fromSession as AppLeague)) {
      // promove de volta para localStorage
      try { localStorage.setItem(STORAGE_KEY, fromSession); } catch { /* noop */ }
      return fromSession as AppLeague;
    }
  } catch {
    /* noop */
  }
  return null;
};

const writeStoredLeague = (next: AppLeague) => {
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
  try { sessionStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
};

const wipeStoredLeague = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
};

export const AppLeagueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Hidrata sincronamente para evitar piscar de "sem liga" e fallback errado.
  const [league, setLeagueState] = useState<AppLeague | null>(() => readStoredLeague());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredLeague();
    if (!stored) {
      wipeStoredLeague();
      setLeagueState(null);
    } else {
      setLeagueState(stored);
    }
    setReady(true);
  }, []);

  // Sync entre abas
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const stored = e.newValue;
      if (!stored || !VALID_LEAGUES.includes(stored as AppLeague)) {
        setLeagueState(null);
      } else {
        setLeagueState(stored as AppLeague);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setLeague = (next: AppLeague) => {
    if (!VALID_LEAGUES.includes(next)) return;
    writeStoredLeague(next);
    setLeagueState(next);
  };

  const clearLeague = () => {
    wipeStoredLeague();
    setLeagueState(null);
  };

  return (
    <AppLeagueContext.Provider value={{ league, setLeague, clearLeague, ready }}>
      {children}
    </AppLeagueContext.Provider>
  );
};

export const useAppLeague = () => {
  const ctx = useContext(AppLeagueContext);
  if (!ctx) throw new Error('useAppLeague must be used within AppLeagueProvider');
  return ctx;
};
