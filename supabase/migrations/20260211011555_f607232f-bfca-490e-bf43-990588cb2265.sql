
-- 1. Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- 2. Allow authenticated users to only read their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Allow admins to view all profiles (for admin features)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create a public view without user_id for leaderboards/public display
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, team_name, cartoleiro_name, avatar_url, patrimony, team_value, balance, created_at, updated_at
FROM public.profiles;
