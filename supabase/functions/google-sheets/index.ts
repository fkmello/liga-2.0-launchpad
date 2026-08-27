import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SERVICE_ACCOUNT_EMAIL = 'cartolags-bot@decent-oxygen-455715-r9.iam.gserviceaccount.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Base64url encode
function base64url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

// Convert PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// Create and sign JWT for Google service account
async function createSignedJWT(privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  
  const headerB64 = base64urlStr(JSON.stringify(header));
  const payloadB64 = base64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  
  const privateKey = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  
  const signatureB64 = base64url(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

// Get access token from Google OAuth
async function getAccessToken(privateKeyPem: string): Promise<string> {
  const jwt = await createSignedJWT(privateKeyPem);
  
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token [${response.status}]: ${errorText}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

// Fetch range from Google Sheets
async function fetchSheetRange(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API error [${response.status}]: ${errorText}`);
  }
  
  const data = await response.json();
  return data.values || [];
}

// Format round number to tab name
function getRoundTabName(rodada: number): string {
  return `RDD #${rodada.toString().padStart(2, '0')}`;
}

// Handle confrontos action
async function handleConfrontos(accessToken: string, spreadsheetId: string, rodada: number) {
  const tabName = getRoundTabName(rodada);
  
  // Fetch a wider range to get all data: B2:H13 covers title, round name, and 10 matches
  const range = `'${tabName}'!B2:H13`;
  const values = await fetchSheetRange(accessToken, spreadsheetId, range);
  
  if (!values || values.length < 3) {
    return { tournament: '', round: '', matches: [] };
  }
  
  const tournament = values[0]?.[0] || '';
  const round = values[1]?.[0] || '';
  
  // Matches start at row index 2 (row 4 in sheet)
  // Column B = index 0 (team1), Column H = index 6 (team2)
  const matches = [];
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const team1 = row?.[0]?.trim();
    const team2 = row?.[6]?.trim();
    
    if (team1 && team2) {
      const score1 = row?.[2]?.trim() || '';
      const score2 = row?.[4]?.trim() || '';
      matches.push({
        team1,
        team2,
        score1,
        score2,
        matchOrder: i - 1,
      });
    }
  }
  
  return { tournament, round, matches };
}

// Handle classificacao action
async function handleClassificacao(accessToken: string, spreadsheetId: string) {
  const range = `'CLASSIFICAÇÃO'!A1:Z100`;
  const values = await fetchSheetRange(accessToken, spreadsheetId, range);
  return { data: values };
}

interface ColumnMapping {
  headerRight: number;
  teamRight: number;
  scoreIdaRight: number;
  scoreVoltaRight: number;
  podiumBadge: number;
  podiumName: number;
}

const COPA_COLUMNS: ColumnMapping = {
  headerRight: 7,
  teamRight: 8,
  scoreIdaRight: 9,
  scoreVoltaRight: 10,
  podiumBadge: 14,
  podiumName: 15,
};

const LIBERTADORES_COLUMNS: ColumnMapping = {
  headerRight: 6,
  teamRight: 7,
  scoreIdaRight: 8,
  scoreVoltaRight: 9,
  podiumBadge: 12,
  podiumName: 13,
};

// Handle confrontos_copa action
async function handleConfrontosCopa(accessToken: string, spreadsheetId: string, fase: string, cols: ColumnMapping = COPA_COLUMNS) {
  // Map phase name to actual tab name in spreadsheet
  const tabNameMap: Record<string, string> = {
    'Final': 'FINAL',
  };
  const tabName = tabNameMap[fase] || fase;
  const range = `'${tabName}'!A1:P200`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API error [${response.status}]: ${errorText}`);
  }
  
  const data = await response.json();
  const values: string[][] = data.values || [];
  
  if (!values || values.length < 3) {
    return { fase, rodadaInfo: '', matches: [] };
  }
  
  // rodadaInfo: extract clean text from line 2
  const rawInfo = values[1]?.filter(v => v?.trim()).join(' ') || '';
  const rodadaInfo = rawInfo.replace(/\n/g, ' ');
  
  const matches: Array<{
    team1: string; team2: string;
    scoreIda1: string; scoreVolta1: string;
    scoreIda2: string; scoreVolta2: string;
    matchNumber: string;
  }> = [];
  
  const isFinal = fase === 'Final';
  
  // Scan all rows looking for team data patterns
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;
    
    const cellB = row[1]?.toString().trim();
    const cellRight = row[cols.headerRight]?.toString().trim();
    
    // Match header row pattern: "JOGO X" or for Final tab: "FINAL", "3º LUGAR" etc.
    const jogoMatch = cellB?.match(/^JOGO\s+(\d+)$/i);
    const isFinalHeader = isFinal && (cellB === 'FINAL' || cellB?.match(/^\d+[ºo°]\s*LUGAR$/i));
    
    if (jogoMatch || isFinalHeader) {
      const matchNumber = jogoMatch ? jogoMatch[1] : cellB;
      const team1Row = values[i + 1] || [];
      const team2Row = values[i + 2] || [];
      
      // Left side: Col C = index 2 (name), Col D = index 3 (score/ida), Col E = index 4 (volta)
      matches.push({
        team1: team1Row[2]?.trim() || '',
        team2: team2Row[2]?.trim() || '',
        scoreIda1: team1Row[3]?.toString().trim() || '',
        scoreVolta1: isFinal ? '' : (team1Row[4]?.toString().trim() || ''),
        scoreIda2: team2Row[3]?.toString().trim() || '',
        scoreVolta2: isFinal ? '' : (team2Row[4]?.toString().trim() || ''),
        matchNumber,
      });
      
      // Right side
      const jogoMatchH = cellRight?.match(/^JOGO\s+(\d+)$/i);
      const isFinalHeaderH = isFinal && (cellRight === 'FINAL' || cellRight?.match(/^\d+[ºo°]\s*LUGAR$/i));
      
      if (jogoMatchH || isFinalHeaderH) {
        const matchNumberH = jogoMatchH ? jogoMatchH[1] : cellRight;
        matches.push({
          team1: team1Row[cols.teamRight]?.trim() || '',
          team2: team2Row[cols.teamRight]?.trim() || '',
          scoreIda1: team1Row[cols.scoreIdaRight]?.toString().trim() || '',
          scoreVolta1: isFinal ? '' : (team1Row[cols.scoreVoltaRight]?.toString().trim() || ''),
          scoreIda2: team2Row[cols.scoreIdaRight]?.toString().trim() || '',
          scoreVolta2: isFinal ? '' : (team2Row[cols.scoreVoltaRight]?.toString().trim() || ''),
          matchNumber: matchNumberH,
        });
      }
    }
  }
  
  if (!isFinal) {
    matches.sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber));
  }
  
  // Extract podium data
  let podium = undefined;
  if (isFinal) {
    const champ = values[4]?.[cols.podiumName]?.trim();
    const second = values[7]?.[cols.podiumName]?.trim();
    const third = values[10]?.[cols.podiumName]?.trim();
    if (champ || second || third) {
      podium = [
        { position: 1, badge: values[4]?.[cols.podiumBadge]?.trim() || '', team: champ || '' },
        { position: 2, badge: values[7]?.[cols.podiumBadge]?.trim() || '', team: second || '' },
        { position: 3, badge: values[10]?.[cols.podiumBadge]?.trim() || '', team: third || '' },
      ];
    }
  }

  return { fase, rodadaInfo, matches, ...(isFinal ? { isFinal: true } : {}), ...(podium ? { podium } : {}) };
}

// Handle dados_externos action
async function handleDadosExternos(accessToken: string, spreadsheetId: string) {
  const range = `'DADOS EXTERNOS'!A1:Z100`;
  let values: string[][];
  try {
    values = await fetchSheetRange(accessToken, spreadsheetId, range);
  } catch (_e) {
    // Tab doesn't exist in this spreadsheet — return empty
    return { headers: [], rows: [], raw: [], teams: {} };
  }
  
  // Parse into team name -> badge URL mapping
  // Try to find the relevant columns based on headers
  const teams: Record<string, string> = {};
  
  if (values.length > 0) {
    // Find column indices for team name and badge URL
    const headers = values[0].map(h => h?.toLowerCase?.() || '');
    
    // Return raw data so frontend can handle mapping
    return { headers: values[0], rows: values.slice(1), raw: values };
  }
  
  return { teams, raw: values };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('GOOGLE_PRIVATE_KEY is not configured');
    }
    
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const league = url.searchParams.get('league') || 'serie_a';
    
    // Map league to spreadsheet ID env var
    const spreadsheetEnvMap: Record<string, string> = {
      'serie_a': 'GOOGLE_SPREADSHEET_ID',
      'serie_b': 'GOOGLE_SPREADSHEET_ID_SERIE_B',
      'serie_c': 'GOOGLE_SPREADSHEET_ID_SERIE_C',
      'copa_br': 'GOOGLE_SPREADSHEET_ID_COPA_BR',
      'libertadores': 'GOOGLE_SPREADSHEET_ID_LIBERTADORES',
      'sulamericana': 'GOOGLE_SPREADSHEET_ID_SULAMERICANA',
    };
    
    if (!action) {
      throw new Error('Missing "action" query parameter');
    }

    // Handle Liga Clássica actions
    if (action === 'ranking_liga') {
      const ligaId = Deno.env.get('GOOGLE_SPREADSHEET_ID_LIGA');
      if (!ligaId) throw new Error('GOOGLE_SPREADSHEET_ID_LIGA is not configured');
      
      const periodo = url.searchParams.get('periodo') || 'ANUAL';
      const accessToken = await getAccessToken(privateKey);
      
      // Fetch ranking data and badge URLs in parallel
      const [values, externalValues] = await Promise.all([
        fetchSheetRange(accessToken, ligaId, `'${periodo}'!B2:E63`),
        fetchSheetRange(accessToken, ligaId, "'DADOS EXTERNOS'!C:F"),
      ]);
      
      // Build badge map from DADOS EXTERNOS (col C = team name, col F = badge URL)
      const normalizeName = (name: string) =>
        name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
      
      const badgeMap = new Map<string, string>();
      for (const row of externalValues) {
        const teamName = row[0]?.toString().trim();
        const badgeUrl = row[3]?.toString().trim(); // col F is index 3 (C=0, D=1, E=2, F=3)
        if (teamName && badgeUrl) {
          badgeMap.set(normalizeName(teamName), badgeUrl);
        }
      }
      
      // Line 0 = title, line 1 = headers, data from line 2 onwards
      const title = values[0]?.[0] || '';
      const rankings: Array<{ position: string; badge: string; teamName: string; total: string }> = [];
      
      for (let i = 2; i < values.length; i++) {
        const row = values[i];
        const position = row?.[0]?.trim();
        const teamName = row?.[2]?.trim() || '';
        const total = row?.[3]?.trim() || '0';
        // Lookup badge from external data map
        const badge = badgeMap.get(normalizeName(teamName)) || row?.[1]?.trim() || '';
        if (position && teamName) {
          rankings.push({ position, badge, teamName, total });
        }
      }
      
      return new Response(JSON.stringify({ title, rankings }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const accessToken = await getAccessToken(privateKey);
    
    let result;
    
    // Handle copa_br-specific actions
    if (action === 'confrontos_copa' || action === 'base_dados_copa') {
      const copaId = Deno.env.get('GOOGLE_SPREADSHEET_ID_COPA_BR');
      if (!copaId) throw new Error('GOOGLE_SPREADSHEET_ID_COPA_BR is not configured');
      
      if (action === 'confrontos_copa') {
        const fase = url.searchParams.get('fase') || '1ª Fase';
        result = await handleConfrontosCopa(accessToken, copaId, fase);
      } else {
        // base_dados_copa: fetch the correct "Dados Externos" tab based on fase
        const fase = url.searchParams.get('fase') || '1ª Fase';
        const fasesComDuasAbas = ['2ª Fase', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Final'];
        
        let values: string[][] = [];
        
        if (fasesComDuasAbas.includes(fase)) {
          const [preValues, fase2Values] = await Promise.all([
            fetchSheetRange(accessToken, copaId, "'Dados Externos Pre'!A:C").catch(() => [] as string[][]),
            fetchSheetRange(accessToken, copaId, "'Dados Ext Fase 2'!A:C").catch(() => [] as string[][]),
          ]);
          const headerRow = preValues[0] || fase2Values[0] || [];
          const preRows = preValues.length > 1 ? preValues.slice(1) : [];
          const fase2Rows = fase2Values.length > 1 ? fase2Values.slice(1) : [];
          const merged = new Map<string, string[]>();
          for (const row of preRows) {
            if (row[0]) merged.set(row[0].trim().toLowerCase(), row);
          }
          for (const row of fase2Rows) {
            if (row[0]) merged.set(row[0].trim().toLowerCase(), row);
          }
          values = [headerRow, ...merged.values()];
        } else {
          const dadosExtTabMap: Record<string, string> = {
            '1ª Fase': 'Dados Externos Pre',
            '2ª Fase': 'Dados Ext Fase 2',
          };
          const tabName = dadosExtTabMap[fase] || 'Dados Externos Pre';
          try {
            values = await fetchSheetRange(accessToken, copaId, `'${tabName}'!A:C`);
          } catch (_e) {
            values = await fetchSheetRange(accessToken, copaId, "'Dados Externos Pre'!A:C");
          }
        }
        
        const headers = values.length > 0 ? values[0] : [];
        const rows = values.length > 1 ? values.slice(1) : [];
        result = { headers, rows, raw: values };
      }
    } else if (action === 'confrontos_libertadores' || action === 'dados_externos_libertadores' || action === 'classificacao_libertadores' || action === 'confrontos_libertadores_grupos'
      || action === 'confrontos_sulamericana' || action === 'dados_externos_sulamericana' || action === 'classificacao_sulamericana' || action === 'confrontos_sulamericana_grupos') {
      
      const isSulamericana = action.includes('sulamericana');
      const envKey = isSulamericana ? 'GOOGLE_SPREADSHEET_ID_SULAMERICANA' : 'GOOGLE_SPREADSHEET_ID_LIBERTADORES';
      const sheetId = Deno.env.get(envKey);
      if (!sheetId) throw new Error(`${envKey} is not configured`);
      
      const baseAction = action.replace('_sulamericana', '_libertadores');
      
      if (baseAction === 'dados_externos_libertadores') {
        const values = await fetchSheetRange(accessToken, sheetId, "'DADOS EXTERNOS'!A:C");
        const headers = values.length > 0 ? values[0] : [];
        const rows = values.length > 1 ? values.slice(1) : [];
        result = { headers, rows, raw: values };
      } else if (baseAction === 'classificacao_libertadores') {
        const range = `'FASE DE GRUPOS'!A1:Y100`;
        const values = await fetchSheetRange(accessToken, sheetId, range);
        
        const HIDDEN_LEFT = new Set([9, 11]);
        const HIDDEN_RIGHT = new Set([9, 11]);
        
        const dataRows = values.slice(2);
        const groups: Array<{ name: string; headers: string[]; rows: string[][] }> = [];
        
        const filterCols = (row: string[], startCol: number, hidden: Set<number>): string[] => {
          const result: string[] = [];
          for (let i = 0; i < 12; i++) {
            if (!hidden.has(i)) {
              result.push(row[startCol + i] || '');
            }
          }
          return result;
        };
        
        const findGroupName = (row: string[], startCol: number, endCol: number): string => {
          for (let c = startCol; c < endCol; c++) {
            const val = (row[c] || '').toString().trim();
            if (val.toUpperCase().includes('GRUPO')) return val;
          }
          return '';
        };
        
        let i = 0;
        while (i < dataRows.length) {
          const row = dataRows[i];
          const leftHeader = findGroupName(row || [], 0, 12);
          const rightHeader = findGroupName(row || [], 13, 25);
          
          if (leftHeader || rightHeader) {
            const leftHeaders = filterCols(row, 0, HIDDEN_LEFT);
            const rightHeaders = filterCols(row, 13, HIDDEN_RIGHT);
            
            const leftRows: string[][] = [];
            const rightRows: string[][] = [];
            for (let j = 1; j <= 4; j++) {
              const teamRow = dataRows[i + j];
              if (teamRow) {
                leftRows.push(filterCols(teamRow, 0, HIDDEN_LEFT));
                rightRows.push(filterCols(teamRow, 13, HIDDEN_RIGHT));
              }
            }
            
            if (leftHeader) {
              groups.push({ name: leftHeader, headers: leftHeaders, rows: leftRows });
            }
            // Skip Group H for Sulamericana
            if (rightHeader && !(isSulamericana && rightHeader.toUpperCase().includes('GRUPO H'))) {
              groups.push({ name: rightHeader, headers: rightHeaders, rows: rightRows });
            }
            
            i += 5;
          } else {
            i++;
          }
        }
        
        result = { groups };
      } else if (baseAction === 'confrontos_libertadores_grupos') {
        const rodadaStr = url.searchParams.get('rodada') || '1';
        const rodada = parseInt(rodadaStr, 10);
        if (isNaN(rodada) || rodada < 1 || rodada > 6) throw new Error('Invalid "rodada" for groups (1-6)');
        
        const tabName = getRoundTabName(rodada);
        // Sulamericana: only up to row 31 (skip rows 32-34), Libertadores: up to row 34
        const lastRow = isSulamericana ? 31 : 34;
        const range = `'${tabName}'!B2:H${lastRow}`;
        const values = await fetchSheetRange(accessToken, sheetId, range);
        
        const tournament = values[0]?.[0] || '';
        const round = `Rodada ${rodada}`;
        
        // Sulamericana has 7 groups (A-G), Libertadores has 8 (A-H)
        const groupHeaderIndices = isSulamericana
          ? [2, 6, 10, 14, 18, 22, 26]
          : [2, 6, 10, 14, 18, 22, 26, 30];
        const groups: Array<{ name: string; matches: Array<{ team1: string; team2: string; score1: string; score2: string; matchOrder: number }> }> = [];
        let matchOrder = 1;
        
        for (const gi of groupHeaderIndices) {
          if (gi >= values.length) break;
          const groupName = (values[gi]?.[1] || values[gi]?.[2] || values[gi]?.[3] || values[gi]?.[4] || values[gi]?.[5] || '').toString().trim();
          const matches: Array<{ team1: string; team2: string; score1: string; score2: string; matchOrder: number }> = [];
          
          for (let offset = 1; offset <= 2; offset++) {
            const row = values[gi + offset];
            if (!row) continue;
            const team1 = row[0]?.trim() || '';
            const team2 = row[6]?.trim() || '';
            if (team1 || team2) {
              matches.push({
                team1,
                team2,
                score1: row[2]?.trim() || '',
                score2: row[4]?.trim() || '',
                matchOrder: matchOrder++,
              });
            }
          }
          
          if (groupName) {
            groups.push({ name: groupName, matches });
          }
        }
        
        result = { tournament, round, groups };
      } else {
        // confrontos knockout - reuse Copa pattern
        const fase = url.searchParams.get('fase') || 'Oitavas de Final';
        const libCols = fase === 'Final' ? LIBERTADORES_COLUMNS : COPA_COLUMNS;
        result = await handleConfrontosCopa(accessToken, sheetId, fase, libCols);
      }
    } else if (
      action === 'dados_externos_campeoes' ||
      action === 'classificacao_campeoes' ||
      action === 'confrontos_campeoes_fase_liga' ||
      action === 'confrontos_campeoes'
    ) {
      const campId = Deno.env.get('GOOGLE_SPREADSHEET_ID_CAMPEOES');
      if (!campId) throw new Error('GOOGLE_SPREADSHEET_ID_CAMPEOES is not configured');

      if (action === 'dados_externos_campeoes') {
        let values: string[][] = [];
        try {
          values = await fetchSheetRange(accessToken, campId, "'DADOS EXTERNOS'!A:C");
        } catch (_e) {
          values = [];
        }
        const headers = values.length > 0 ? values[0] : [];
        const rows = values.length > 1 ? values.slice(1) : [];
        result = { dados_externos: { headers, rows, raw: values } };
      } else if (action === 'classificacao_campeoes') {
        let values: string[][] = [];
        try {
          values = await fetchSheetRange(accessToken, campId, `'CLA'!A1:Z100`);
        } catch (_e) {
          try {
            values = await fetchSheetRange(accessToken, campId, `'CLASSIFICAÇÃO'!A1:Z100`);
          } catch (_e2) {
            values = [];
          }
        }
        // Detect first data row: skip rows where col A is not numeric position
        const rows: Array<{
          position: string; badge: string; name: string;
          points: string; games: string; wins: string; draws: string; losses: string;
          gp: string; gc: string; sg: string;
        }> = [];
        for (const row of values) {
          const pos = (row?.[0] || '').toString().trim();
          if (!/^\d+$/.test(pos)) continue;
          rows.push({
            position: pos,
            badge: (row?.[1] || '').toString().trim(),
            name: (row?.[2] || '').toString().trim(),
            points: (row?.[3] || '').toString().trim(),
            games: (row?.[4] || '').toString().trim(),
            wins: (row?.[5] || '').toString().trim(),
            draws: (row?.[6] || '').toString().trim(),
            losses: (row?.[7] || '').toString().trim(),
            gp: (row?.[8] || '').toString().trim(),
            gc: (row?.[9] || '').toString().trim(),
            sg: (row?.[10] || '').toString().trim(),
          });
        }
        result = { classificacao: { rows } };
      } else if (action === 'confrontos_campeoes_fase_liga') {
        const rodadaStr = url.searchParams.get('rodada') || '1';
        const rodada = parseInt(rodadaStr, 10);
        if (isNaN(rodada) || rodada < 1 || rodada > 8) {
          throw new Error('Invalid "rodada" for Champions league phase (1-8)');
        }
        let confrontos: { tournament: string; round: string; matches: unknown[] };
        try {
          confrontos = await handleConfrontos(accessToken, campId, rodada);
        } catch (_e) {
          confrontos = { tournament: '', round: `Rodada ${rodada}`, matches: [] };
        }
        result = {
          fases: {
            'Fase de Liga': {
              [`rodada_${rodada}`]: confrontos,
            },
          },
        };
      } else {
        // confrontos_campeoes (knockout)
        const fase = url.searchParams.get('fase') || 'Playoffs';
        const tabNameMap: Record<string, string> = {
          'Playoffs': 'PLAYOFFS',
          'Oitavas de Final': 'OITAVAS DE FINAL',
          'Quartas de Final': 'QUARTAS DE FINAL',
          'Semifinal': 'SEMIFINAL',
          'Final': 'FINAL',
        };
        const tabName = tabNameMap[fase] || fase;
        let knockout;
        try {
          knockout = await handleConfrontosCopa(accessToken, campId, tabName, LIBERTADORES_COLUMNS);
        } catch (_e) {
          knockout = { fase: tabName, rodadaInfo: '', matches: [] };
        }
        // Restore canonical fase name (frontend uses display name)
        knockout.fase = fase;
        result = { fases: { [fase]: knockout } };
      }
    } else if (action === 'dados_externos_intercontinental' || action === 'confrontos_intercontinental') {
      const interconId = Deno.env.get('GOOGLE_SPREADSHEET_ID_INTERCONTINENTAL');
      if (!interconId) throw new Error('GOOGLE_SPREADSHEET_ID_INTERCONTINENTAL is not configured');

      if (action === 'dados_externos_intercontinental') {
        const values = await fetchSheetRange(accessToken, interconId, "'DADOS EXTERNOS'!A:C");
        const headers = values.length > 0 ? values[0] : [];
        const rows = values.length > 1 ? values.slice(1) : [];
        result = { headers, rows, raw: values };
      } else {
        // confrontos_intercontinental
        const fase = url.searchParams.get('fase') || 'Quartas de Final';
        const tabNameMap: Record<string, string> = { 'Final': 'FINAL' };
        const tabName = tabNameMap[fase] || fase;
        const range = `'${tabName}'!A1:N200`;
        const rangeUrl = `${SHEETS_BASE}/${interconId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
        const resp = await fetch(rangeUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) { const err = await resp.text(); throw new Error(`Google Sheets API error [${resp.status}]: ${err}`); }
        const sheetData = await resp.json();
        const values: string[][] = sheetData.values || [];

        const rodadaInfo = (values[1]?.filter(v => v?.trim()).join(' ') || '').replace(/\n/g, ' ');

        const matches: Array<{
          team1: string; team2: string;
          scoreIda1: string; scoreVolta1: string;
          scoreIda2: string; scoreVolta2: string;
          matchNumber: string;
        }> = [];

        // Line 4 (index 3) has headers like "JOGO 1", "JOGO 2" etc.
        const headerRow = values[3] || [];
        const team1Row = values[4] || [];
        const team2Row = values[5] || [];

        // Left side: cols B(1), C(2), D(3)
        // Right side: cols G(6), H(7), I(8)
        const sides = [
          { headerIdx: 1, nameIdx: 2, scoreIdx: 3 },
          { headerIdx: 6, nameIdx: 7, scoreIdx: 8 },
        ];

        for (const side of sides) {
          const header = headerRow[side.headerIdx]?.toString().trim();
          if (!header) continue;
          const jogoMatch = header.match(/^JOGO\s+(\d+)$/i);
          const isFinalHeader = header === 'FINAL' || header?.match(/^\d+[ºo°]\s*LUGAR$/i);
          if (jogoMatch || isFinalHeader) {
            matches.push({
              team1: team1Row[side.nameIdx]?.trim() || '',
              team2: team2Row[side.nameIdx]?.trim() || '',
              scoreIda1: team1Row[side.scoreIdx]?.toString().trim() || '',
              scoreVolta1: '',
              scoreIda2: team2Row[side.scoreIdx]?.toString().trim() || '',
              scoreVolta2: '',
              matchNumber: jogoMatch ? jogoMatch[1] : header,
            });
          }
        }

        // Also check for additional rows (e.g. JOGO 3, JOGO 4 on rows 8-9, headers on row 7)
        // Scan for more header rows beyond the first set
        for (let ri = 6; ri < values.length; ri++) {
          const row = values[ri];
          if (!row) continue;
          for (const side of sides) {
            const cellVal = row[side.headerIdx]?.toString().trim();
            if (!cellVal) continue;
            const jm = cellVal.match(/^JOGO\s+(\d+)$/i);
            const isFH = cellVal === 'FINAL' || cellVal?.match(/^\d+[ºo°]\s*LUGAR$/i);
            if (jm || isFH) {
              const t1Row = values[ri + 1] || [];
              const t2Row = values[ri + 2] || [];
              matches.push({
                team1: t1Row[side.nameIdx]?.trim() || '',
                team2: t2Row[side.nameIdx]?.trim() || '',
                scoreIda1: t1Row[side.scoreIdx]?.toString().trim() || '',
                scoreVolta1: '',
                scoreIda2: t2Row[side.scoreIdx]?.toString().trim() || '',
                scoreVolta2: '',
                matchNumber: jm ? jm[1] : cellVal,
              });
            }
          }
        }

        // De-duplicate matches by matchNumber (first set already captured rows 3-5)
        const seen = new Set<string>();
        const uniqueMatches = matches.filter(m => {
          const key = `${m.matchNumber}-${m.team1}-${m.team2}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Sort by match number
        uniqueMatches.sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber));

        // Podium (only on Final tab)
        let podium = undefined;
        if (fase === 'Final') {
          const champ = values[4]?.[13]?.trim(); // N5
          const second = values[7]?.[13]?.trim(); // N8
          const third = values[10]?.[13]?.trim(); // N11
          if (champ || second || third) {
            podium = [
              { position: 1, badge: values[4]?.[12]?.trim() || '', team: champ || '' },
              { position: 2, badge: values[7]?.[12]?.trim() || '', team: second || '' },
              { position: 3, badge: values[10]?.[12]?.trim() || '', team: third || '' },
            ];
          }
        }

        result = { fase, rodadaInfo, matches: uniqueMatches, isFinal: true, ...(podium ? { podium } : {}) };
      }
    } else if (action === 'dados_gerais_times') {
      // Admin-only: fetch team list from master spreadsheet
      const userId = claimsData.claims.sub as string;
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: roleData } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const dadosGeraisId = Deno.env.get('GOOGLE_SPREADSHEET_ID_DADOS_GERAIS');
      if (!dadosGeraisId) throw new Error('GOOGLE_SPREADSHEET_ID_DADOS_GERAIS is not configured');

      const values = await fetchSheetRange(accessToken, dadosGeraisId, "'DADOS GERAIS'!A:C");
      const teams: Array<{ team_name: string; id_cartola: string; serie: string }> = [];
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const teamName = row?.[0]?.trim();
        const idCartola = row?.[1]?.trim();
        const serie = row?.[2]?.trim() || '';
        if (teamName && idCartola) {
          teams.push({ team_name: teamName, id_cartola: idCartola, serie });
        }
      }
      result = { teams };
    } else {
      const envKey = spreadsheetEnvMap[league];
      if (!envKey) throw new Error(`Unknown league: ${league}`);
      const spreadsheetId = Deno.env.get(envKey);
      if (!spreadsheetId) throw new Error(`${envKey} is not configured`);
      
      switch (action) {
        case 'confrontos': {
          const rodadaStr = url.searchParams.get('rodada');
          if (!rodadaStr) throw new Error('Missing "rodada" parameter');
          const rodada = parseInt(rodadaStr, 10);
          if (isNaN(rodada) || rodada < 1 || rodada > 38) throw new Error('Invalid "rodada"');
          result = await handleConfrontos(accessToken, spreadsheetId, rodada);
          break;
        }
        case 'classificacao':
          result = await handleClassificacao(accessToken, spreadsheetId);
          break;
        case 'dados_externos':
          result = await handleDadosExternos(accessToken, spreadsheetId);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Edge function error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
