import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

async function verifyAdmin(supabaseUrl: string, serviceRoleKey: string, userId: string): Promise<boolean> {
  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (!action) {
      throw new Error('Missing "action" parameter');
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    // Helper to get user ID from token
    const getUserId = async (): Promise<string> => {
      if (!token) throw new Error('Missing authorization');
      const client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData, error } = await client.auth.getClaims(token);
      if (error || !claimsData?.claims?.sub) throw new Error('Unauthorized');
      return claimsData.claims.sub as string;
    };

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === 'generate') {
      const userId = await getUserId();
      const isAdmin = await verifyAdmin(supabaseUrl, serviceRoleKey, userId);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const teamData: Array<{ team_name: string; id_cartola: string; serie: string }> = body.team_data;
      if (!teamData || !Array.isArray(teamData) || teamData.length === 0) {
        throw new Error('Missing or invalid team_data');
      }

      // Generate unique code with retry
      let code = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateCode();
        const { data: existing } = await adminClient
          .from('invite_codes')
          .select('id')
          .eq('code', candidate)
          .maybeSingle();
        if (!existing) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error('Failed to generate unique code after 10 attempts');

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: inserted, error: insertError } = await adminClient
        .from('invite_codes')
        .insert({
          code,
          team_data: teamData,
          created_by: userId,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ code: inserted.code, expires_at: inserted.expires_at }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'validate') {
      const code = url.searchParams.get('code');
      if (!code) throw new Error('Missing "code" parameter');

      const { data, error } = await adminClient
        .from('invite_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ valid: false, reason: 'CODE_NOT_FOUND' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (data.used_at) {
        return new Response(JSON.stringify({ valid: false, reason: 'CODE_ALREADY_USED' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (new Date(data.expires_at) < new Date()) {
        return new Response(JSON.stringify({ valid: false, reason: 'CODE_EXPIRED' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ valid: true, team_data: data.team_data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'redeem') {
      const userId = await getUserId();
      const body = await req.json();
      const code = body.code?.toUpperCase();
      if (!code) throw new Error('Missing "code" in body');

      const { data, error } = await adminClient.rpc('redeem_invite_code', {
        p_code: code,
        p_user_id: userId,
      });

      if (error) {
        // Parse specific error messages from the function
        const msg = error.message || '';
        if (msg.includes('USER_ALREADY_HAS_TEAMS')) {
          return new Response(JSON.stringify({ error: 'Você já possui times vinculados.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (msg.includes('CODE_NOT_FOUND')) {
          return new Response(JSON.stringify({ error: 'Código não encontrado.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (msg.includes('CODE_ALREADY_USED')) {
          return new Response(JSON.stringify({ error: 'Código já foi utilizado.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (msg.includes('CODE_EXPIRED')) {
          return new Response(JSON.stringify({ error: 'Código expirado.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw error;
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'list') {
      const userId = await getUserId();
      const isAdmin = await verifyAdmin(supabaseUrl, serviceRoleKey, userId);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await adminClient
        .from('invite_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ codes: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    console.error('invite-codes error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
