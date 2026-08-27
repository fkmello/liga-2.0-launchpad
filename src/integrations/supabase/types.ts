export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          team_data: Json
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          team_data: Json
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          team_data?: Json
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      league_closed_periods: {
        Row: {
          closed_at: string
          closed_by: string | null
          id: string
          period_key: string
          season_year: number
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          period_key: string
          season_year: number
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          period_key?: string
          season_year?: number
        }
        Relationships: []
      }
      league_disabled_periods: {
        Row: {
          disabled_at: string
          disabled_by: string | null
          id: string
          period_key: string
          season_year: number
        }
        Insert: {
          disabled_at?: string
          disabled_by?: string | null
          id?: string
          period_key: string
          season_year: number
        }
        Update: {
          disabled_at?: string
          disabled_by?: string | null
          id?: string
          period_key?: string
          season_year?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          club: string
          club_badge_url: string | null
          created_at: string
          id: string
          is_captain: boolean | null
          is_reserve: boolean | null
          name: string
          photo_url: string | null
          points: number | null
          position: Database["public"]["Enums"]["player_position"]
          price: number
          profile_id: string
          round_id: string
        }
        Insert: {
          club: string
          club_badge_url?: string | null
          created_at?: string
          id?: string
          is_captain?: boolean | null
          is_reserve?: boolean | null
          name: string
          photo_url?: string | null
          points?: number | null
          position: Database["public"]["Enums"]["player_position"]
          price?: number
          profile_id: string
          round_id: string
        }
        Update: {
          club?: string
          club_badge_url?: string | null
          created_at?: string
          id?: string
          is_captain?: boolean | null
          is_reserve?: boolean | null
          name?: string
          photo_url?: string | null
          points?: number | null
          position?: Database["public"]["Enums"]["player_position"]
          price?: number
          profile_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number | null
          cartoleiro_name: string
          created_at: string
          deleted_at: string | null
          id: string
          patrimony: number | null
          team_name: string
          team_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number | null
          cartoleiro_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          patrimony?: number | null
          team_name: string
          team_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number | null
          cartoleiro_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          patrimony?: number | null
          team_name?: string
          team_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rankings: {
        Row: {
          created_at: string
          id: string
          position: number | null
          profile_id: string
          round_id: string
          round_points: number | null
          total_points: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number | null
          profile_id: string
          round_id: string
          round_points?: number | null
          total_points?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          position?: number | null
          profile_id?: string
          round_id?: string
          round_points?: number | null
          total_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rankings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rankings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rankings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          id: string
          market_close_time: string | null
          number: number
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          market_close_time?: string | null
          number: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          created_at?: string
          id?: string
          market_close_time?: string | null
          number?: number
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: []
      }
      sheets_cache: {
        Row: {
          cache_key: string
          data: Json
          id: string
          synced_at: string
          synced_by: string | null
          type: string | null
        }
        Insert: {
          cache_key: string
          data: Json
          id?: string
          synced_at?: string
          synced_by?: string | null
          type?: string | null
        }
        Update: {
          cache_key?: string
          data?: Json
          id?: string
          synced_at?: string
          synced_by?: string | null
          type?: string | null
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          created_at: string
          id: string
          match_order: number | null
          player1_id: string | null
          player1_score: number | null
          player2_id: string | null
          player2_score: number | null
          round: number
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_order?: number | null
          player1_id?: string | null
          player1_score?: number | null
          player2_id?: string | null
          player2_score?: number | null
          round: number
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_order?: number | null
          player1_id?: string | null
          player1_score?: number | null
          player2_id?: string | null
          player2_score?: number | null
          round?: number
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_settings: {
        Row: {
          enabled: boolean
          finished: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          finished?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          finished?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_sync_state: {
        Row: {
          created_at: string
          current_round: number | null
          first_sync_at: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_sync_phase: string
          last_sync_status: string | null
          league: string
          market_opened_at: string | null
          market_status: number | null
          season: number
          second_sync_done: boolean
          synced_round: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_round?: number | null
          first_sync_at?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_phase?: string
          last_sync_status?: string | null
          league: string
          market_opened_at?: string | null
          market_status?: number | null
          season: number
          second_sync_done?: boolean
          synced_round?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_round?: number | null
          first_sync_at?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_phase?: string
          last_sync_status?: string | null
          league?: string
          market_opened_at?: string | null
          market_status?: number | null
          season?: number
          second_sync_done?: boolean
          synced_round?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          created_at: string
          description: string | null
          end_round: number | null
          id: string
          name: string
          start_round: number | null
          status: Database["public"]["Enums"]["tournament_status"]
          type: Database["public"]["Enums"]["tournament_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_round?: number | null
          id?: string
          name: string
          start_round?: number | null
          status?: Database["public"]["Enums"]["tournament_status"]
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          end_round?: number | null
          id?: string
          name?: string
          start_round?: number | null
          status?: Database["public"]["Enums"]["tournament_status"]
          type?: Database["public"]["Enums"]["tournament_type"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_teams: {
        Row: {
          created_at: string
          id: string
          id_cartola: string
          league: string
          serie: string | null
          team_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_cartola: string
          league?: string
          serie?: string | null
          team_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          id_cartola?: string
          league?: string
          serie?: string | null
          team_name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          cartoleiro_name: string | null
          created_at: string | null
          id: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          cartoleiro_name?: string | null
          created_at?: string | null
          id?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          cartoleiro_name?: string | null
          created_at?: string | null
          id?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      redeem_invite_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      player_position: "GOL" | "LAT" | "ZAG" | "MEI" | "ATA" | "TEC"
      round_status: "upcoming" | "open" | "closed" | "finished"
      tournament_status: "draft" | "active" | "finished"
      tournament_type: "mata_mata" | "pontos_corridos" | "turno_returno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      player_position: ["GOL", "LAT", "ZAG", "MEI", "ATA", "TEC"],
      round_status: ["upcoming", "open", "closed", "finished"],
      tournament_status: ["draft", "active", "finished"],
      tournament_type: ["mata_mata", "pontos_corridos", "turno_returno"],
    },
  },
} as const
