import { useState, useEffect, useCallback, useRef } from 'react';
import { CartolaTeamData } from '@/types';
import { buildCartolaUrl } from '@/config/cartolaEndpoint';


interface UseCartolaTeamResult {
  data: CartolaTeamData | null;
  loading: boolean;
  error: string | null;
  refetch: (force?: boolean) => void;
  valorizacaoLive: number;
}

/**
 * Busca dados de time da API do Cartola para uma liga específica.
 * `league` é OBRIGATÓRIO para evitar fallback implícito ao endpoint default.
 */
export function useCartolaTeam(
  idCartola: string | undefined,
  league: string,
): UseCartolaTeamResult {
  const [data, setData] = useState<CartolaTeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valorizacaoLive, setValorizacaoLive] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (force = false) => {
    // Guard anti-loading-infinito: sem id ou sem liga, não busca.
    if (!idCartola || !league) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const url = buildCartolaUrl({ id_cartola: idCartola }, league, { nocache: force });
      console.log('[cartolaTeam]', { idCartola, league, url, force });
      const res = await fetch(url, {
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        cache: force ? 'no-store' : 'default',
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const json: CartolaTeamData = await res.json();

      // Copa do Mundo: usar as URLs de uniforme já retornadas pela função `cartola`
      // (copa2026/<ABREV>.png). Não sobrescrever aqui.


      setData(json);
      setError(null);

      // Live valuation only relevant for brasileirao default endpoint
      if (json.mercado.status_mercado === 2 && league === 'brasileirao') {
        try {
          const guruRes = await fetch(
            `${projectUrl}/functions/v1/guru-valorizacao`,
            { headers: { 'apikey': anonKey, 'Content-Type': 'application/json' } }
          );
          if (guruRes.ok) {
            const guruData = await guruRes.json();
            const soma = json.titulares.reduce((acc, p) => {
              return acc + (guruData?.[p.atleta_id]?.valorizacao ?? 0);
            }, 0);
            setValorizacaoLive(soma);
          } else {
            setValorizacaoLive(0);
          }
        } catch {
          setValorizacaoLive(0);
        }
      } else {
        setValorizacaoLive(0);
      }

      return json;
    } catch (e: any) {
      console.error('useCartolaTeam error:', e);
      setError(e.message || 'Erro ao buscar dados do Cartola');
      return null;
    } finally {
      setLoading(false);
    }
  }, [idCartola, league]);

  useEffect(() => {
    setLoading(true);
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (data?.mercado.status_mercado === 2) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, 30_000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [data?.mercado.status_mercado, fetchData]);

  return { data, loading, error, refetch: fetchData, valorizacaoLive };
}
