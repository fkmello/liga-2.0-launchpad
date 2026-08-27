
-- Recreate public_profiles view without sensitive financial fields
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
SELECT id, team_name, cartoleiro_name, avatar_url, created_at, updated_at
FROM public.profiles;
