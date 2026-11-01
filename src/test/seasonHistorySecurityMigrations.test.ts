import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const foundation = readFileSync(
  'supabase/migrations/20261031193000_season_history_foundation.sql',
  'utf8',
);
const archiveRpc = readFileSync(
  'supabase/migrations/20261101130000_archive_season_history_rpc.sql',
  'utf8',
);

describe('season history database security migrations', () => {
  const tables = [
    'season_archives',
    'season_archive_standings',
    'season_archive_competitions',
    'season_archive_events',
  ];

  it('enables RLS and explicitly removes client write privileges on every archive table', () => {
    for (const table of tables) {
      expect(foundation).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(foundation).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated;`),
      );
      expect(foundation).toMatch(
        new RegExp(`GRANT SELECT ON public\\.${table} TO authenticated;`),
      );
    }
  });

  it('does not grant authenticated users direct insert, update, or delete access', () => {
    expect(foundation).not.toMatch(/GRANT\\s+[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*TO\\s+authenticated/i);
  });

  it('restricts archive publication to authenticated admins through a security-definer RPC', () => {
    expect(archiveRpc).toContain('SECURITY DEFINER');
    expect(archiveRpc).toContain('auth.uid() IS NULL OR NOT public.is_admin(auth.uid())');
    expect(archiveRpc).toContain('REVOKE ALL ON FUNCTION public.archive_season_history(jsonb) FROM PUBLIC;');
    expect(archiveRpc).toContain('REVOKE ALL ON FUNCTION public.archive_season_history(jsonb) FROM anon;');
    expect(archiveRpc).toContain('GRANT EXECUTE ON FUNCTION public.archive_season_history(jsonb) TO authenticated;');
  });

  it('accepts only a real JSON boolean true for the season-finalized confirmation', () => {
    expect(archiveRpc).toContain(
      `(p_payload->'summary'->'seasonFinalized') IS DISTINCT FROM 'true'::jsonb`,
    );
    expect(archiveRpc).not.toContain(`(p_payload->'summary'->>'seasonFinalized')::boolean`);
  });
});
