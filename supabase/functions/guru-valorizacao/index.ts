const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GURU_URL = 'https://pb89hpsof3.execute-api.us-east-1.amazonaws.com/prod/atletas-pontuados';
const CACHE_TTL_MS = 60_000;

let cachedData: Record<string, unknown> | null = null;
let cachedAt = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    if (cachedData && now - cachedAt < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(GURU_URL);
    if (!res.ok) {
      console.error(`Guru API returned ${res.status}`);
      return new Response(JSON.stringify({}), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    cachedData = data;
    cachedAt = now;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Guru fetch error:', err);
    return new Response(JSON.stringify({}), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
