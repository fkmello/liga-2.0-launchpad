-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create enum for round status
CREATE TYPE public.round_status AS ENUM ('upcoming', 'open', 'closed', 'finished');

-- Create enum for tournament status
CREATE TYPE public.tournament_status AS ENUM ('draft', 'active', 'finished');

-- Create enum for tournament type
CREATE TYPE public.tournament_type AS ENUM ('mata_mata', 'pontos_corridos', 'turno_returno');

-- Create enum for player position
CREATE TYPE public.player_position AS ENUM ('GOL', 'LAT', 'ZAG', 'MEI', 'ATA', 'TEC');

-- ===============================
-- USER ROLES TABLE (security)
-- ===============================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ===============================
-- PROFILES TABLE
-- ===============================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    team_name TEXT NOT NULL,
    cartoleiro_name TEXT NOT NULL,
    patrimony DECIMAL(12,2) DEFAULT 100.00,
    team_value DECIMAL(12,2) DEFAULT 0.00,
    balance DECIMAL(12,2) DEFAULT 100.00,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===============================
-- ROUNDS TABLE
-- ===============================
CREATE TABLE public.rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number INTEGER NOT NULL UNIQUE,
    status round_status NOT NULL DEFAULT 'upcoming',
    market_close_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- ===============================
-- PLAYERS TABLE (escalados pelo usuário)
-- ===============================
CREATE TABLE public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    position player_position NOT NULL,
    club TEXT NOT NULL,
    club_badge_url TEXT,
    price DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    photo_url TEXT,
    is_captain BOOLEAN DEFAULT FALSE,
    is_reserve BOOLEAN DEFAULT FALSE,
    points DECIMAL(8,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ===============================
-- RANKINGS TABLE
-- ===============================
CREATE TABLE public.rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE NOT NULL,
    round_points DECIMAL(8,2) DEFAULT 0.00,
    total_points DECIMAL(10,2) DEFAULT 0.00,
    position INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (profile_id, round_id)
);

ALTER TABLE public.rankings ENABLE ROW LEVEL SECURITY;

-- ===============================
-- TOURNAMENTS TABLE
-- ===============================
CREATE TABLE public.tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type tournament_type NOT NULL DEFAULT 'mata_mata',
    status tournament_status NOT NULL DEFAULT 'draft',
    description TEXT,
    start_round INTEGER,
    end_round INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- ===============================
-- TOURNAMENT MATCHES TABLE
-- ===============================
CREATE TABLE public.tournament_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
    round INTEGER NOT NULL,
    player1_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    player2_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    player1_score DECIMAL(8,2),
    player2_score DECIMAL(8,2),
    winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    match_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- ===============================
-- RLS POLICIES
-- ===============================

-- User roles: only admins can view/manage roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Profiles: everyone can read, users can only update their own
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Rounds: everyone can read, admins can manage
CREATE POLICY "Rounds are viewable by everyone"
ON public.rounds
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage rounds"
ON public.rounds
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Players: everyone can read, users manage their own
CREATE POLICY "Players are viewable by everyone"
ON public.players
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can manage their own players"
ON public.players
FOR ALL
TO authenticated
USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Rankings: everyone can read
CREATE POLICY "Rankings are viewable by everyone"
ON public.rankings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage rankings"
ON public.rankings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tournaments: everyone can read, admins can manage
CREATE POLICY "Tournaments are viewable by everyone"
ON public.tournaments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage tournaments"
ON public.tournaments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tournament matches: everyone can read, admins can manage
CREATE POLICY "Tournament matches are viewable by everyone"
ON public.tournament_matches
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage tournament matches"
ON public.tournament_matches
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===============================
-- TRIGGERS
-- ===============================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for profiles
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, team_name, cartoleiro_name)
    VALUES (NEW.id, 'Meu Time FC', COALESCE(NEW.raw_user_meta_data->>'full_name', 'Cartoleiro'));
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();