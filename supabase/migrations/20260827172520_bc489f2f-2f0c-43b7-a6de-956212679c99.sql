CREATE OR REPLACE FUNCTION public.__export_auth()
RETURNS TABLE (kind text, row_data jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT 'user'::text, to_jsonb(u) FROM auth.users u
  UNION ALL
  SELECT 'identity'::text, to_jsonb(i) FROM auth.identities i
$$;

REVOKE ALL ON FUNCTION public.__export_auth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__export_auth() TO service_role;