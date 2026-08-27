
-- Recreate the view with security_invoker to use the querying user's permissions
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
SELECT id, team_name, cartoleiro_name, avatar_url, patrimony, team_value, balance, created_at, updated_at
FROM public.profiles;
