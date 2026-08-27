-- 1. Função auxiliar: moderador ou admin (leitura ampliada)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator')
  )
$$;

-- 2. PROFILES ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3. USER_TEAMS ----------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all teams" ON public.user_teams;
DROP POLICY IF EXISTS "Users can view their own teams" ON public.user_teams;
DROP POLICY IF EXISTS "System can insert teams" ON public.user_teams;

CREATE POLICY "Users can view their own teams"
ON public.user_teams FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all teams"
ON public.user_teams FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Users can insert their own teams"
ON public.user_teams FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage teams"
ON public.user_teams FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 4. INVITE_CODES --------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage invite codes" ON public.invite_codes;

CREATE POLICY "Admins can manage invite codes"
ON public.invite_codes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. TOURNAMENT_SYNC_STATE: moderador também pode acompanhar
DROP POLICY IF EXISTS "Admins can view sync state" ON public.tournament_sync_state;

CREATE POLICY "Staff can view sync state"
ON public.tournament_sync_state FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

-- 6. Execução de funções: fecha as internas de trigger
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_financial_self_update() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.redeem_invite_code(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- 7. Grants coerentes com as políticas (sem acesso anônimo)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_teams FROM anon;
REVOKE ALL ON public.invite_codes FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_teams TO authenticated;
GRANT ALL ON public.user_teams TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_codes TO authenticated;
GRANT ALL ON public.invite_codes TO service_role;