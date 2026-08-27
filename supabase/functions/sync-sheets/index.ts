import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Google Sheets Auth (copied from google-sheets function) ───

const SERVICE_ACCOUNT_EMAIL = "cartolags-bot@decent-oxygen-455715-r9.iam.gserviceaccount.com";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function base64url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlStr(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function createSignedJWT(privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: SERVICE_ACCOUNT_EMAIL, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now };
  const headerB64 = base64urlStr(JSON.stringify(header));
  const payloadB64 = base64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const privateKey = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function getAccessToken(privateKeyPem: string): Promise<string> {
  const jwt = await createSignedJWT(privateKeyPem);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!response.ok) throw new Error(`Failed to get access token [${response.status}]: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function fetchSheetRange(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Sheets API error [${response.status}]: ${await response.text()}`);
  return (await response.json()).values || [];
}

function getRoundTabName(rodada: number): string {
  return `RDD #${rodada.toString().padStart(2, "0")}`;
}

// ─── Spreadsheet ID helpers ───

const LEAGUE_ENV_MAP: Record<string, string> = {
  serie_a: "GOOGLE_SPREADSHEET_ID",
  serie_b: "GOOGLE_SPREADSHEET_ID_SERIE_B",
  serie_c: "GOOGLE_SPREADSHEET_ID_SERIE_C",
};

function getLeagueSpreadsheetId(league: string): string {
  const envKey = LEAGUE_ENV_MAP[league];
  if (!envKey) throw new Error(`Unknown league: ${league}`);
  const id = Deno.env.get(envKey);
  if (!id) throw new Error(`${envKey} is not configured`);
  return id;
}

// ─── Parsing functions (same logic as google-sheets) ───

async function parseClassificacao(accessToken: string, spreadsheetId: string) {
  const values = await fetchSheetRange(accessToken, spreadsheetId, `'CLASSIFICAÇÃO'!A1:Z100`);
  return { data: values };
}

async function parseDadosExternos(accessToken: string, spreadsheetId: string) {
  let values: string[][];
  try {
    values = await fetchSheetRange(accessToken, spreadsheetId, `'DADOS EXTERNOS'!A1:Z100`);
  } catch (_e) {
    return { headers: [], rows: [], raw: [], teams: {} };
  }
  if (values.length > 0) {
    return { headers: values[0], rows: values.slice(1), raw: values };
  }
  return { teams: {}, raw: values };
}

async function parseResultados(accessToken: string, spreadsheetId: string, rodada: number) {
  const tabName = getRoundTabName(rodada);
  const range = `'${tabName}'!B2:H13`;
  const values = await fetchSheetRange(accessToken, spreadsheetId, range);
  if (!values || values.length < 3) return { tournament: "", round: "", matches: [] };
  const tournament = values[0]?.[0] || "";
  const round = values[1]?.[0] || "";
  const matches = [];
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const team1 = row?.[0]?.trim();
    const team2 = row?.[6]?.trim();
    if (team1 && team2) {
      matches.push({
        team1, team2,
        score1: row?.[2]?.trim() || "",
        score2: row?.[4]?.trim() || "",
        matchOrder: i - 1,
      });
    }
  }
  return { tournament, round, matches };
}

// ─── Copa / Tournament parsing ───

interface ColumnMapping {
  headerRight: number; teamRight: number; scoreIdaRight: number; scoreVoltaRight: number; podiumBadge: number; podiumName: number;
}

const COPA_COLUMNS: ColumnMapping = { headerRight: 7, teamRight: 8, scoreIdaRight: 9, scoreVoltaRight: 10, podiumBadge: 14, podiumName: 15 };
const LIBERTADORES_COLUMNS: ColumnMapping = { headerRight: 6, teamRight: 7, scoreIdaRight: 8, scoreVoltaRight: 9, podiumBadge: 12, podiumName: 13 };

async function parseConfrontosCopa(accessToken: string, spreadsheetId: string, fase: string, cols: ColumnMapping = COPA_COLUMNS) {
  const tabNameMap: Record<string, string> = { Final: "FINAL" };
  const tabName = tabNameMap[fase] || fase;
  const range = `'${tabName}'!A1:P200`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Sheets API error [${response.status}]: ${await response.text()}`);
  const values: string[][] = (await response.json()).values || [];
  if (!values || values.length < 3) return { fase, rodadaInfo: "", matches: [] };

  const rawInfo = values[1]?.filter((v) => v?.trim()).join(" ") || "";
  const rodadaInfo = rawInfo.replace(/\n/g, " ");
  const matches: any[] = [];
  const isFinal = fase === "Final";

  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;
    const cellB = row[1]?.toString().trim();
    const cellRight = row[cols.headerRight]?.toString().trim();
    const jogoMatch = cellB?.match(/^JOGO\s+(\d+)$/i);
    const isFinalHeader = isFinal && (cellB === "FINAL" || cellB?.match(/^\d+[ºo°]\s*LUGAR$/i));

    if (jogoMatch || isFinalHeader) {
      const matchNumber = jogoMatch ? jogoMatch[1] : cellB;
      const team1Row = values[i + 1] || [];
      const team2Row = values[i + 2] || [];
      matches.push({
        team1: team1Row[2]?.trim() || "", team2: team2Row[2]?.trim() || "",
        scoreIda1: team1Row[3]?.toString().trim() || "", scoreVolta1: isFinal ? "" : (team1Row[4]?.toString().trim() || ""),
        scoreIda2: team2Row[3]?.toString().trim() || "", scoreVolta2: isFinal ? "" : (team2Row[4]?.toString().trim() || ""),
        matchNumber,
      });
      const jogoMatchH = cellRight?.match(/^JOGO\s+(\d+)$/i);
      const isFinalHeaderH = isFinal && (cellRight === "FINAL" || cellRight?.match(/^\d+[ºo°]\s*LUGAR$/i));
      if (jogoMatchH || isFinalHeaderH) {
        const matchNumberH = jogoMatchH ? jogoMatchH[1] : cellRight;
        matches.push({
          team1: team1Row[cols.teamRight]?.trim() || "", team2: team2Row[cols.teamRight]?.trim() || "",
          scoreIda1: team1Row[cols.scoreIdaRight]?.toString().trim() || "", scoreVolta1: isFinal ? "" : (team1Row[cols.scoreVoltaRight]?.toString().trim() || ""),
          scoreIda2: team2Row[cols.scoreIdaRight]?.toString().trim() || "", scoreVolta2: isFinal ? "" : (team2Row[cols.scoreVoltaRight]?.toString().trim() || ""),
          matchNumber: matchNumberH,
        });
      }
    }
  }
  if (!isFinal) matches.sort((a: any, b: any) => parseInt(a.matchNumber) - parseInt(b.matchNumber));

  let podium = undefined;
  if (isFinal) {
    const champ = values[4]?.[cols.podiumName]?.trim();
    const second = values[7]?.[cols.podiumName]?.trim();
    const third = values[10]?.[cols.podiumName]?.trim();
    if (champ || second || third) {
      podium = [
        { position: 1, badge: values[4]?.[cols.podiumBadge]?.trim() || "", team: champ || "" },
        { position: 2, badge: values[7]?.[cols.podiumBadge]?.trim() || "", team: second || "" },
        { position: 3, badge: values[10]?.[cols.podiumBadge]?.trim() || "", team: third || "" },
      ];
    }
  }
  return { fase, rodadaInfo, matches, ...(isFinal ? { isFinal: true } : {}), ...(podium ? { podium } : {}) };
}

// Copa do Brasil dados externos (merges two tabs)
async function parseCopaBaseDados(accessToken: string, spreadsheetId: string) {
  const [preValues, fase2Values] = await Promise.all([
    fetchSheetRange(accessToken, spreadsheetId, "'Dados Externos Pre'!A:C").catch(() => [] as string[][]),
    fetchSheetRange(accessToken, spreadsheetId, "'Dados Ext Fase 2'!A:C").catch(() => [] as string[][]),
  ]);
  const headerRow = preValues[0] || fase2Values[0] || [];
  const preRows = preValues.length > 1 ? preValues.slice(1) : [];
  const fase2Rows = fase2Values.length > 1 ? fase2Values.slice(1) : [];
  const merged = new Map<string, string[]>();
  for (const row of preRows) if (row[0]) merged.set(row[0].trim().toLowerCase(), row);
  for (const row of fase2Rows) if (row[0]) merged.set(row[0].trim().toLowerCase(), row);
  const values = [headerRow, ...merged.values()];
  return { headers: values.length > 0 ? values[0] : [], rows: values.length > 1 ? values.slice(1) : [], raw: values };
}

// Libertadores / Sulamericana classificacao
async function parseLibertadoresClassificacao(accessToken: string, spreadsheetId: string, isSulamericana: boolean) {
  const values = await fetchSheetRange(accessToken, spreadsheetId, `'FASE DE GRUPOS'!A1:Y100`);
  const HIDDEN = new Set([8, 9, 11]);
  const dataRows = values.slice(2);
  const groups: Array<{ name: string; headers: string[]; rows: string[][] }> = [];

  const filterCols = (row: string[], startCol: number): string[] => {
    const r: string[] = [];
    for (let i = 0; i < 12; i++) if (!HIDDEN.has(i)) r.push(row[startCol + i] || "");
    return r;
  };
  const findGroupName = (row: string[], s: number, e: number): string => {
    for (let c = s; c < e; c++) { const v = (row[c] || "").toString().trim(); if (v.toUpperCase().includes("GRUPO")) return v; }
    return "";
  };

  let i = 0;
  while (i < dataRows.length) {
    const row = dataRows[i];
    const leftH = findGroupName(row || [], 0, 12);
    const rightH = findGroupName(row || [], 13, 25);
    if (leftH || rightH) {
      const lHeaders = filterCols(row!, 0);
      const rHeaders = filterCols(row!, 13);
      const lRows: string[][] = [], rRows: string[][] = [];
      for (let j = 1; j <= 4; j++) {
        const tr = dataRows[i + j];
        if (tr) { lRows.push(filterCols(tr, 0)); rRows.push(filterCols(tr, 13)); }
      }
      if (leftH) groups.push({ name: leftH, headers: lHeaders, rows: lRows });
      if (rightH && !(isSulamericana && rightH.toUpperCase().includes("GRUPO H")))
        groups.push({ name: rightH, headers: rHeaders, rows: rRows });
      i += 5;
    } else { i++; }
  }
  return { groups };
}

// Libertadores / Sulamericana group matches
async function parseLibertadoresGrupos(accessToken: string, spreadsheetId: string, rodada: number, isSulamericana: boolean) {
  const tabName = getRoundTabName(rodada);
  const lastRow = isSulamericana ? 31 : 34;
  const values = await fetchSheetRange(accessToken, spreadsheetId, `'${tabName}'!B2:H${lastRow}`);
  const tournament = values[0]?.[0] || "";
  const round = `Rodada ${rodada}`;
  const groupHeaderIndices = isSulamericana ? [2, 6, 10, 14, 18, 22, 26] : [2, 6, 10, 14, 18, 22, 26, 30];
  const groups: Array<{ name: string; matches: any[] }> = [];
  let matchOrder = 1;
  for (const gi of groupHeaderIndices) {
    if (gi >= values.length) break;
    const groupName = (values[gi]?.[1] || values[gi]?.[2] || values[gi]?.[3] || values[gi]?.[4] || values[gi]?.[5] || "").toString().trim();
    const matches: any[] = [];
    for (let offset = 1; offset <= 2; offset++) {
      const row = values[gi + offset];
      if (!row) continue;
      const t1 = row[0]?.trim() || "", t2 = row[6]?.trim() || "";
      if (t1 || t2) matches.push({ team1: t1, team2: t2, score1: row[2]?.trim() || "", score2: row[4]?.trim() || "", matchOrder: matchOrder++ });
    }
    if (groupName) groups.push({ name: groupName, matches });
  }
  return { tournament, round, groups };
}

// Intercontinental confrontos
async function parseIntercontinentalConfrontos(accessToken: string, spreadsheetId: string, fase: string) {
  const tabNameMap: Record<string, string> = { Final: "FINAL" };
  const tabName = tabNameMap[fase] || fase;
  const range = `'${tabName}'!A1:N200`;
  const rangeUrl = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const resp = await fetch(rangeUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Google Sheets API error [${resp.status}]: ${await resp.text()}`);
  const values: string[][] = (await resp.json()).values || [];

  const rodadaInfo = (values[1]?.filter((v) => v?.trim()).join(" ") || "").replace(/\n/g, " ");
  const matches: any[] = [];
  const sides = [
    { headerIdx: 1, nameIdx: 2, scoreIdx: 3 },
    { headerIdx: 6, nameIdx: 7, scoreIdx: 8 },
  ];

  // First header row (index 3)
  const headerRow = values[3] || [];
  const team1Row = values[4] || [];
  const team2Row = values[5] || [];
  for (const side of sides) {
    const header = headerRow[side.headerIdx]?.toString().trim();
    if (!header) continue;
    const jm = header.match(/^JOGO\s+(\d+)$/i);
    const isFH = header === "FINAL" || header?.match(/^\d+[ºo°]\s*LUGAR$/i);
    if (jm || isFH) {
      matches.push({
        team1: team1Row[side.nameIdx]?.trim() || "", team2: team2Row[side.nameIdx]?.trim() || "",
        scoreIda1: team1Row[side.scoreIdx]?.toString().trim() || "", scoreVolta1: "",
        scoreIda2: team2Row[side.scoreIdx]?.toString().trim() || "", scoreVolta2: "",
        matchNumber: jm ? jm[1] : header,
      });
    }
  }
  // Scan additional rows
  for (let ri = 6; ri < values.length; ri++) {
    const row = values[ri];
    if (!row) continue;
    for (const side of sides) {
      const cellVal = row[side.headerIdx]?.toString().trim();
      if (!cellVal) continue;
      const jm = cellVal.match(/^JOGO\s+(\d+)$/i);
      const isFH = cellVal === "FINAL" || cellVal?.match(/^\d+[ºo°]\s*LUGAR$/i);
      if (jm || isFH) {
        const t1 = values[ri + 1] || [], t2 = values[ri + 2] || [];
        matches.push({
          team1: t1[side.nameIdx]?.trim() || "", team2: t2[side.nameIdx]?.trim() || "",
          scoreIda1: t1[side.scoreIdx]?.toString().trim() || "", scoreVolta1: "",
          scoreIda2: t2[side.scoreIdx]?.toString().trim() || "", scoreVolta2: "",
          matchNumber: jm ? jm[1] : cellVal,
        });
      }
    }
  }
  const seen = new Set<string>();
  const uniqueMatches = matches.filter((m) => { const k = `${m.matchNumber}-${m.team1}-${m.team2}`; if (seen.has(k)) return false; seen.add(k); return true; });
  uniqueMatches.sort((a: any, b: any) => parseInt(a.matchNumber) - parseInt(b.matchNumber));

  let podium = undefined;
  if (fase === "Final") {
    const champ = values[4]?.[13]?.trim();
    const second = values[7]?.[13]?.trim();
    const third = values[10]?.[13]?.trim();
    if (champ || second || third) {
      podium = [
        { position: 1, badge: values[4]?.[12]?.trim() || "", team: champ || "" },
        { position: 2, badge: values[7]?.[12]?.trim() || "", team: second || "" },
        { position: 3, badge: values[10]?.[12]?.trim() || "", team: third || "" },
      ];
    }
  }
  return { fase, rodadaInfo, matches: uniqueMatches, isFinal: true, ...(podium ? { podium } : {}) };
}

// Liga Clássica ranking
const normalizeLigaName = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

async function fetchCartolaBadge(id: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.cartola.globo.com/time/id/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return "";
    const json: any = await res.json();
    return (json?.time?.url_escudo_png || json?.url_escudo_png || "").toString().trim();
  } catch {
    return "";
  }
}

interface LigaBadgeMaps {
  freshByName: Map<string, string>;
  sheetByName: Map<string, string>;
}

async function loadLigaBadgeMap(supabaseAdmin: any): Promise<LigaBadgeMaps> {
  const freshByName = new Map<string, string>();
  const sheetByName = new Map<string, string>();
  try {
    const { data, error } = await supabaseAdmin
      .from("sheets_cache")
      .select("data")
      .eq("cache_key", "dados_externos:liga_classica")
      .maybeSingle();
    if (error || !data?.data?.raw) {
      console.warn("[loadLigaBadgeMap] cache dados_externos:liga_classica vazio ou ausente");
      return { freshByName, sheetByName };
    }
    const raw: any[][] = data.data.raw;
    const entries: { key: string; id: string }[] = [];
    for (let i = 1; i < raw.length && i < 61; i++) {
      const row = raw[i] || [];
      const name = row?.[2]?.toString().trim();
      const id = row?.[3]?.toString().trim();
      const sheetUrl = row?.[5]?.toString().trim();
      if (!name) continue;
      const key = normalizeLigaName(name);
      if (sheetUrl) sheetByName.set(key, sheetUrl);
      if (id) entries.push({ key, id });
    }

    // Concurrency-limited fetch (chunks of 10) — fresh URLs from Cartola API
    const CHUNK = 10;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const urls = await Promise.all(slice.map((e) => fetchCartolaBadge(e.id)));
      slice.forEach((e, idx) => {
        const u = urls[idx];
        if (u) freshByName.set(e.key, u);
      });
    }
    console.log(`[loadLigaBadgeMap] sheet=${sheetByName.size} fresh=${freshByName.size}`);
  } catch (e) {
    console.warn("[loadLigaBadgeMap] erro:", (e as Error).message);
  }
  return { freshByName, sheetByName };
}

async function parseRankingLiga(
  accessToken: string,
  spreadsheetId: string,
  periodo: string,
  badgeMap: LigaBadgeMaps,
) {
  const values = await fetchSheetRange(accessToken, spreadsheetId, `'${periodo}'!B2:E63`);
  const title = values[0]?.[0] || "";
  const rankings: Array<{ position: string; badge: string; teamName: string; total: string }> = [];
  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    const position = row?.[0]?.trim();
    const teamName = row?.[2]?.trim() || "";
    const total = row?.[3]?.trim() || "0";
    const key = normalizeLigaName(teamName);
    const badge =
      badgeMap.freshByName.get(key) ||
      badgeMap.sheetByName.get(key) ||
      row?.[1]?.trim() ||
      "";
    if (position && teamName) rankings.push({ position, badge, teamName, total });
  }
  return { title, rankings };
}

// ─── UPSERT helper ───

async function upsertCache(
  supabaseAdmin: any,
  cacheKey: string,
  type: string,
  data: any,
  syncedBy: string,
): Promise<{ cache_key: string; status: "ok" | "error"; error?: string }> {
  try {
    const { error } = await supabaseAdmin.from("sheets_cache").upsert(
      { cache_key: cacheKey, type, data, synced_at: new Date().toISOString(), synced_by: syncedBy },
      { onConflict: "cache_key" },
    );
    if (error) throw error;
    return { cache_key: cacheKey, status: "ok" };
  } catch (e: any) {
    return { cache_key: cacheKey, status: "error", error: e.message };
  }
}

// ─── Champions League (campeoes) parsers ───

const cleanStr = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "-" ? "" : s;
};

async function parseCampeoesDadosExternos(accessToken: string, spreadsheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, spreadsheetId, `'DADOS EXTERNOS'!A:C`);
    if (!values || values.length === 0) return { headers: [], rows: [], raw: [] };
    const rows = values.slice(1).filter((r) => r && r.some((c) => cleanStr(c) !== ""));
    console.log(`[campeoes] dados externos: ${rows.length} times`);
    return { headers: values[0] || [], rows, raw: values };
  } catch (e: any) {
    console.error(`[campeoes] dados_externos erro: ${e.message}`);
    return { headers: [], rows: [], raw: [] };
  }
}

async function parseCampeoesClassificacao(accessToken: string, spreadsheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, spreadsheetId, `'CLASSIFICAÇÃO'!A1:M100`);
    // Cabeçalho: linha 3 (idx 2). Dados: linha 4+ (idx 3+)
    const dataRows = values.slice(3);
    const rows = [];
    for (const row of dataRows) {
      if (!row || row.every((c) => cleanStr(c) === "")) continue;
      // B=1 posição, C=2 escudo, D=3 nome, E=4 P, F=5 J, G=6 V, H=7 E, I=8 D, J=9 GP, K=10 GC, L=11 SG (M=12 ignorada)
      const name = cleanStr(row[3]);
      if (!name) continue;
      rows.push({
        position: cleanStr(row[1]),
        badge: cleanStr(row[2]),
        name,
        points: cleanStr(row[4]),
        games: cleanStr(row[5]),
        wins: cleanStr(row[6]),
        draws: cleanStr(row[7]),
        losses: cleanStr(row[8]),
        gp: cleanStr(row[9]),
        gc: cleanStr(row[10]),
        sg: cleanStr(row[11]),
      });
    }
    console.log(`[campeoes] classificação: ${rows.length} times`);
    return { rows };
  } catch (e: any) {
    console.error(`[campeoes] classificação erro: ${e.message}`);
    return { rows: [] };
  }
}

async function parseCampeoesFaseLigaRodada(accessToken: string, spreadsheetId: string, rodada: number) {
  const tabName = `RDD #${rodada.toString().padStart(2, "0")}`;
  try {
    // Linhas 6 a 23 (idx 5–22). B=1, C=2, D=3, E=4, F=5, G=6, H=7
    const values = await fetchSheetRange(accessToken, spreadsheetId, `'${tabName}'!B6:H23`);
    const matches: any[] = [];
    let order = 1;
    for (const row of values || []) {
      if (!row) continue;
      const team1 = cleanStr(row[0]); // B
      const team2 = cleanStr(row[6]); // H
      if (!team1 || !team2) continue;
      matches.push({
        team1,
        team2,
        score1: cleanStr(row[2]), // D
        score2: cleanStr(row[4]), // F
        matchOrder: order++,
      });
    }
    console.log(`[campeoes] fase de liga rodada ${rodada}: ${matches.length} confrontos`);
    return { tournament: "Champions League", round: `Rodada ${rodada}`, matches };
  } catch (e: any) {
    console.error(`[campeoes] fase de liga rodada ${rodada} erro: ${e.message}`);
    return { tournament: "Champions League", round: `Rodada ${rodada}`, matches: [] };
  }
}

/**
 * Mata-mata Champions (Playoffs / Oitavas / Quartas / Semifinal):
 * Layout explícito por fase, lendo blocos B-E (casa/vis) e H-K (casa/vis)
 * Cabeçalho na linha 4; cada bloco de confronto: linha N (casa) + N+1 (visitante).
 *  - Playoffs / Oitavas: 8 jogos → blocos em linhas 5/6, 9/10, 13/14, 17/18 (B-E e H-K)
 *  - Quartas: 4 jogos → blocos em linhas 5/6 e 9/10 (B-E e H-K)
 *  - Semi:    2 jogos → blocos em linhas 5/6 (B-E e H-K)
 */
type KOSide = { teamCol: number; scoreIdaCol: number; scoreVoltaCol: number };
type KOBlock = { homeRow: number; side: KOSide };
const KO_SIDE_LEFT: KOSide = { teamCol: 2, scoreIdaCol: 3, scoreVoltaCol: 4 };   // B(1)=escudo, C(2)=nome, D(3)=ida, E(4)=volta
const KO_SIDE_RIGHT: KOSide = { teamCol: 8, scoreIdaCol: 9, scoreVoltaCol: 10 }; // H(7)=escudo, I(8)=nome, J(9)=ida, K(10)=volta

const KO_LAYOUTS: Record<string, KOBlock[]> = {
  Playoffs: [
    { homeRow: 4, side: KO_SIDE_LEFT },  { homeRow: 4, side: KO_SIDE_RIGHT },
    { homeRow: 8, side: KO_SIDE_LEFT },  { homeRow: 8, side: KO_SIDE_RIGHT },
    { homeRow: 12, side: KO_SIDE_LEFT }, { homeRow: 12, side: KO_SIDE_RIGHT },
    { homeRow: 16, side: KO_SIDE_LEFT }, { homeRow: 16, side: KO_SIDE_RIGHT },
  ],
  "Oitavas de Final": [
    { homeRow: 4, side: KO_SIDE_LEFT },  { homeRow: 4, side: KO_SIDE_RIGHT },
    { homeRow: 8, side: KO_SIDE_LEFT },  { homeRow: 8, side: KO_SIDE_RIGHT },
    { homeRow: 12, side: KO_SIDE_LEFT }, { homeRow: 12, side: KO_SIDE_RIGHT },
    { homeRow: 16, side: KO_SIDE_LEFT }, { homeRow: 16, side: KO_SIDE_RIGHT },
  ],
  "Quartas de Final": [
    { homeRow: 4, side: KO_SIDE_LEFT }, { homeRow: 4, side: KO_SIDE_RIGHT },
    { homeRow: 8, side: KO_SIDE_LEFT }, { homeRow: 8, side: KO_SIDE_RIGHT },
  ],
  Semifinal: [
    { homeRow: 4, side: KO_SIDE_LEFT }, { homeRow: 4, side: KO_SIDE_RIGHT },
  ],
};

async function parseCampeoesMataMata(accessToken: string, spreadsheetId: string, fase: string) {
  const tabMap: Record<string, string> = {
    Playoffs: "PLAYOFFS",
    "Oitavas de Final": "OITAVAS DE FINAL",
    "Quartas de Final": "QUARTAS DE FINAL",
    Semifinal: "SEMIFINAL",
  };
  const tab = tabMap[fase];
  const layout = KO_LAYOUTS[fase];
  if (!tab || !layout) return { fase, rodadaInfo: "", matches: [] };

  try {
    const values = await fetchSheetRange(accessToken, spreadsheetId, `'${tab}'!A1:K22`);
    const matches: any[] = [];
    layout.forEach((block, idx) => {
      const casa = values[block.homeRow] || [];
      const vis = values[block.homeRow + 1] || [];
      const team1 = cleanStr(casa[block.side.teamCol]);
      const team2 = cleanStr(vis[block.side.teamCol]);
      if (!team1 && !team2) return;
      matches.push({
        team1,
        team2,
        scoreIda1: cleanStr(casa[block.side.scoreIdaCol]),
        scoreVolta1: cleanStr(casa[block.side.scoreVoltaCol]),
        scoreIda2: cleanStr(vis[block.side.scoreIdaCol]),
        scoreVolta2: cleanStr(vis[block.side.scoreVoltaCol]),
        matchNumber: String(idx + 1),
      });
    });
    console.log(`[campeoes][KO][parse]`, { fase, blocosEsperados: layout.length, matchesGerados: matches.length });
    return { fase, rodadaInfo: "", matches };
  } catch (e: any) {
    console.error(`[campeoes] ${fase} erro: ${e.message}`);
    return { fase, rodadaInfo: "", matches: [] };
  }
}

/**
 * Final Champions: B4:E6 = Final | H4:K6 = disputa de 3º lugar.
 * Cabeçalho na linha 4; casa na linha 5 (idx 4); visitante na linha 6 (idx 5).
 * Escudo em B/H, nome em C/I, ida em D/J, volta em E/K.
 */
async function parseCampeoesFinal(accessToken: string, spreadsheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, spreadsheetId, `'FINAL'!A1:K10`);
    const matches: any[] = [];
    const casa = values[4] || [];
    const vis = values[5] || [];
    // Layout aba FINAL Champions (jogo único, sem volta):
    //  - Final:     B5:D6  → escudo B(1), nome C(2), placar D(3)
    //  - 3º Lugar:  G5:I6  → escudo G(6), nome H(7), placar I(8)
    const sides: Array<{ tipo: 'final' | 'terceiro_lugar'; teamCol: number; scoreIdaCol: number; matchNumber: string }> = [
      { tipo: 'final',          teamCol: 2, scoreIdaCol: 3, matchNumber: 'FINAL' },
      { tipo: 'terceiro_lugar', teamCol: 7, scoreIdaCol: 8, matchNumber: '3º LUGAR' },
    ];
    for (const s of sides) {
      const team1 = cleanStr(casa[s.teamCol]);
      const team2 = cleanStr(vis[s.teamCol]);
      if (!team1 && !team2) continue;
      matches.push({
        tipo: s.tipo,
        team1,
        team2,
        scoreIda1: cleanStr(casa[s.scoreIdaCol]),
        scoreVolta1: '',
        scoreIda2: cleanStr(vis[s.scoreIdaCol]),
        scoreVolta2: '',
        matchNumber: s.matchNumber,
      });
    }
    console.log(`[campeoes][KO][parse]`, { fase: 'Final', blocosEsperados: 2, matchesGerados: matches.length });
    return { fase: "Final", rodadaInfo: "", matches, isFinal: true };
  } catch (e: any) {
    console.error(`[campeoes] final erro: ${e.message}`);
    return { fase: "Final", rodadaInfo: "", matches: [], isFinal: true };
  }
}

// ─── Champions: fetchers granulares ───

async function fetchCampeoesFaseLiga(accessToken: string, sheetId: string, rodada?: number) {
  const faseLiga: Record<string, any> = {};
  const rodadas = rodada ? [rodada] : [1, 2, 3, 4, 5, 6, 7, 8];
  for (const r of rodadas) {
    faseLiga[`rodada_${r}`] = await parseCampeoesFaseLigaRodada(accessToken, sheetId, r);
  }
  return faseLiga;
}

async function fetchCampeoesFasesEliminatorias(accessToken: string, sheetId: string) {
  const fases: Record<string, any> = {};
  for (const fase of ["Playoffs", "Oitavas de Final", "Quartas de Final", "Semifinal"]) {
    fases[fase] = await parseCampeoesMataMata(accessToken, sheetId, fase);
  }
  fases["Final"] = await parseCampeoesFinal(accessToken, sheetId);
  return fases;
}

// Merge profundo seguro — não sobrescreve com payload vazio
function safeMergeCampeoes(existing: any, updates: any) {
  return {
    fases: {
      ...existing?.fases,
      ...updates?.fases,
      "Fase de Liga": {
        ...existing?.fases?.["Fase de Liga"],
        ...updates?.fases?.["Fase de Liga"],
      },
    },
    classificacao:
      updates?.classificacao?.rows?.length
        ? updates.classificacao
        : existing?.classificacao,
    dados_externos:
      updates?.dados_externos?.rows?.length
        ? updates.dados_externos
        : existing?.dados_externos,
  };
}

function logCampeoesSync(scope: string, rodada: number | undefined, existing: any, merged: any) {
  console.log("[campeoes][sync]", {
    scope,
    rodada,
    rodadaKey: rodada ? `rodada_${rodada}` : undefined,
    hasExisting: !!existing,
    totalFases: Object.keys(merged?.fases || {}).length,
    totalRodadasLiga: Object.keys(merged?.fases?.["Fase de Liga"] || {}).length,
    hasClassificacao: !!merged?.classificacao?.rows?.length,
    hasDadosExternos: !!merged?.dados_externos?.rows?.length,
  });
}

// ── FULL REBUILD (substituição total)
async function syncCampeoesAll(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const sheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID_CAMPEOES");
  if (!sheetId) throw new Error("GOOGLE_SPREADSHEET_ID_CAMPEOES is not configured");

  const fasesLiga = await fetchCampeoesFaseLiga(accessToken, sheetId);
  const fasesKO = await fetchCampeoesFasesEliminatorias(accessToken, sheetId);
  const classificacao = await parseCampeoesClassificacao(accessToken, sheetId);
  const dadosExternos = await parseCampeoesDadosExternos(accessToken, sheetId);

  const merged = {
    fases: { "Fase de Liga": fasesLiga, ...fasesKO },
    classificacao,
    dados_externos: dadosExternos,
  };

  // Guard pós-merge: estrutura mínima
  if (
    !merged.fases?.["Fase de Liga"] ||
    Object.keys(merged.fases["Fase de Liga"]).length === 0 ||
    !merged.classificacao?.rows?.length ||
    !merged.dados_externos?.rows?.length
  ) {
    throw new Error("[campeoes][sync-error] estrutura final inválida após rebuild");
  }

  logCampeoesSync("campeoes_all", undefined, null, merged);

  const result = await upsertCache(supabaseAdmin, "campeoes", "campeoes", merged, syncedBy);
  return [result];
}

// ── Sync apenas uma rodada da Fase de Liga + classificação
async function syncCampeoesRodada(
  accessToken: string,
  rodada: number,
  syncedBy: string,
  supabaseAdmin: any,
) {
  if (!rodada || rodada < 1 || rodada > 8) {
    throw new Error("[campeoes] rodada inválida (1-8)");
  }
  const sheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID_CAMPEOES");
  if (!sheetId) throw new Error("GOOGLE_SPREADSHEET_ID_CAMPEOES is not configured");

  const { data: existingRow } = await supabaseAdmin
    .from("sheets_cache")
    .select("data")
    .eq("cache_key", "campeoes")
    .maybeSingle();

  // Fallback automático: se cache vazio, executa rebuild completo
  if (!existingRow?.data) {
    console.log("[campeoes] cache inexistente — executando fallback campeoes_all");
    return syncCampeoesAll(accessToken, syncedBy, supabaseAdmin);
  }

  const novaRodada = await parseCampeoesFaseLigaRodada(accessToken, sheetId, rodada);
  if (!novaRodada?.matches?.length) {
    throw new Error("[campeoes][sync-error] rodada sem matches");
  }
  const novaClassificacao = await parseCampeoesClassificacao(accessToken, sheetId);
  if (!novaClassificacao?.rows?.length) {
    throw new Error("[campeoes][sync-error] classificacao vazia");
  }

  const rodadaKey = `rodada_${rodada}`;
  const updates = {
    fases: {
      "Fase de Liga": { [rodadaKey]: novaRodada },
    },
    classificacao: novaClassificacao,
  };

  const merged = safeMergeCampeoes(existingRow.data, updates);

  if (!merged.fases || !merged.classificacao || !merged.dados_externos) {
    throw new Error("[campeoes][sync-error] merge gerou estrutura inválida");
  }

  logCampeoesSync("campeoes_rodada", rodada, existingRow.data, merged);

  const result = await upsertCache(supabaseAdmin, "campeoes", "campeoes", merged, syncedBy);
  return [result];
}

// ── Sync apenas dados externos
async function syncCampeoesDadosExternos(
  accessToken: string,
  syncedBy: string,
  supabaseAdmin: any,
) {
  const sheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID_CAMPEOES");
  if (!sheetId) throw new Error("GOOGLE_SPREADSHEET_ID_CAMPEOES is not configured");

  const { data: existingRow } = await supabaseAdmin
    .from("sheets_cache")
    .select("data")
    .eq("cache_key", "campeoes")
    .maybeSingle();

  if (!existingRow?.data) {
    console.log("[campeoes] cache inexistente — executando fallback campeoes_all");
    return syncCampeoesAll(accessToken, syncedBy, supabaseAdmin);
  }

  const novosDadosExternos = await parseCampeoesDadosExternos(accessToken, sheetId);
  if (!novosDadosExternos?.rows?.length) {
    throw new Error("[campeoes][sync-error] dados_externos vazio");
  }

  const merged = safeMergeCampeoes(existingRow.data, { dados_externos: novosDadosExternos });

  if (!merged.fases || !merged.classificacao || !merged.dados_externos) {
    throw new Error("[campeoes][sync-error] merge gerou estrutura inválida");
  }

  logCampeoesSync("campeoes_dados_externos", undefined, existingRow.data, merged);

  const result = await upsertCache(supabaseAdmin, "campeoes", "campeoes", merged, syncedBy);
  return [result];
}

// ── Sync apenas uma fase eliminatória (mata-mata) + classificação
const CAMPEOES_KO_FASES = ["Playoffs", "Oitavas de Final", "Quartas de Final", "Semifinal", "Final"];

async function syncCampeoesFaseKO(
  accessToken: string,
  fase: string,
  syncedBy: string,
  supabaseAdmin: any,
) {
  if (!CAMPEOES_KO_FASES.includes(fase)) {
    throw new Error(`[campeoes] fase inválida: ${fase}. Use uma de: ${CAMPEOES_KO_FASES.join(", ")}`);
  }
  const sheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID_CAMPEOES");
  if (!sheetId) throw new Error("GOOGLE_SPREADSHEET_ID_CAMPEOES is not configured");

  const { data: existingRow } = await supabaseAdmin
    .from("sheets_cache")
    .select("data")
    .eq("cache_key", "campeoes")
    .maybeSingle();

  // Fallback: se cache inexistente, faz rebuild completo
  if (!existingRow?.data) {
    console.log("[campeoes] cache inexistente — executando fallback campeoes_all");
    return syncCampeoesAll(accessToken, syncedBy, supabaseAdmin);
  }

  const novaFase = fase === "Final"
    ? await parseCampeoesFinal(accessToken, sheetId)
    : await parseCampeoesMataMata(accessToken, sheetId, fase);

  if (!novaFase?.matches?.length) {
    throw new Error(`[campeoes][sync-error] fase ${fase} sem matches`);
  }

  // Atualiza também a classificação (movimentações entre rodadas afetam pontuação geral)
  const novaClassificacao = await parseCampeoesClassificacao(accessToken, sheetId);
  if (!novaClassificacao?.rows?.length) {
    throw new Error("[campeoes][sync-error] classificacao vazia");
  }

  const updates = {
    fases: { [fase]: novaFase },
    classificacao: novaClassificacao,
  };

  const merged = safeMergeCampeoes(existingRow.data, updates);

  if (!merged.fases || !merged.classificacao || !merged.dados_externos) {
    throw new Error("[campeoes][sync-error] merge gerou estrutura inválida");
  }

  logCampeoesSync(`campeoes_fase_ko:${fase}`, undefined, existingRow.data, merged);

  const result = await upsertCache(supabaseAdmin, "campeoes", "campeoes", merged, syncedBy);
  return [result];
}

// Compat: scope=tournament&tournament=campeoes → alias de campeoes_all
async function syncCampeoes(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  return syncCampeoesAll(accessToken, syncedBy, supabaseAdmin);
}



// ─── Copa do Mundo FIFA (copa_mundo) parsers/syncs ───
// IMPORTANTE: as chaves internas das fases são padronizadas e não devem
// ser substituídas por labels humanos no cache, queryKeys ou comparações:
//   fase_grupos | 16avos | oitavas | quartas | semifinal | final
const COPA_MUNDO_KO_PHASES = ['16avos', 'oitavas', 'quartas', 'semifinal', 'final'] as const;
type CopaMundoKoPhase = typeof COPA_MUNDO_KO_PHASES[number];
const COPA_MUNDO_KO_TAB: Record<CopaMundoKoPhase, string> = {
  '16avos': '16-AVOS DE FINAL',
  oitavas: 'OITAVAS DE FINAL',
  quartas: 'QUARTAS DE FINAL',
  semifinal: 'SEMIFINAL',
  final: 'FINAL',
};
// Cada confronto ocupa 2 linhas (casa/visitante). Esquerda B/C/D, direita H/I/J.
// homeRow = índice (0-based) da linha do time da casa.
const COPA_MUNDO_KO_LAYOUT: Record<Exclude<CopaMundoKoPhase, 'final'>, Array<{ homeRow: number; teamCol: number; scoreCol: number; matchNumber: string }>> = {
  '16avos': (() => {
    const rows: Array<{ homeRow: number; teamCol: number; scoreCol: number; matchNumber: string }> = [];
    // 8 esquerda + 8 direita = 16 jogos
    for (let i = 0; i < 8; i++) {
      const homeRow = 4 + i * 4; // 5/6 → idx 4/5; 9/10 → idx 8/9; 13/14 → idx 12/13; ...
      rows.push({ homeRow, teamCol: 2, scoreCol: 3, matchNumber: String(i + 1) });
      rows.push({ homeRow, teamCol: 8, scoreCol: 9, matchNumber: String(i + 1 + 8) });
    }
    return rows;
  })(),
  oitavas: (() => {
    const rows: Array<{ homeRow: number; teamCol: number; scoreCol: number; matchNumber: string }> = [];
    for (let i = 0; i < 4; i++) {
      const homeRow = 4 + i * 4;
      rows.push({ homeRow, teamCol: 2, scoreCol: 3, matchNumber: String(i + 1) });
      rows.push({ homeRow, teamCol: 8, scoreCol: 9, matchNumber: String(i + 1 + 4) });
    }
    return rows;
  })(),
  quartas: (() => {
    const rows: Array<{ homeRow: number; teamCol: number; scoreCol: number; matchNumber: string }> = [];
    for (let i = 0; i < 2; i++) {
      const homeRow = 4 + i * 4;
      rows.push({ homeRow, teamCol: 2, scoreCol: 3, matchNumber: String(i + 1) });
      rows.push({ homeRow, teamCol: 8, scoreCol: 9, matchNumber: String(i + 1 + 2) });
    }
    return rows;
  })(),
  semifinal: [
    { homeRow: 4, teamCol: 2, scoreCol: 3, matchNumber: '1' },
    { homeRow: 4, teamCol: 8, scoreCol: 9, matchNumber: '2' },
  ],
};

function getCopaMundoSheetId(): string {
  const id = Deno.env.get('GOOGLE_SPREADSHEET_ID_COPA_MUNDO');
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID_COPA_MUNDO is not configured');
  return id;
}

async function fetchCopaCartolaBadge(id: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.copa.cartola.globo.com/time/id/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return "";
    const json: any = await res.json();
    return (json?.time?.url_escudo_png || json?.url_escudo_png || "").toString().trim();
  } catch {
    return "";
  }
}

async function parseCopaMundoDadosExternos(accessToken: string, sheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, sheetId, `'DADOS EXTERNOS'!A2:C`);
    const baseRows = (values || [])
      .filter((r) => r && r.some((c) => cleanStr(c) !== ''))
      .map((r) => ({
        team_name: cleanStr(r[0]),
        id_cartola: cleanStr(r[1]),
        sheet_logo: cleanStr(r[2]),
      }));

    // Fetch fresh badges from Copa Cartola API in chunks of 10
    const CHUNK = 10;
    const freshUrls: string[] = new Array(baseRows.length).fill('');
    for (let i = 0; i < baseRows.length; i += CHUNK) {
      const slice = baseRows.slice(i, i + CHUNK);
      const urls = await Promise.all(
        slice.map((r) => (r.id_cartola ? fetchCopaCartolaBadge(r.id_cartola) : Promise.resolve(''))),
      );
      urls.forEach((u, idx) => { freshUrls[i + idx] = u; });
    }

    let freshCount = 0;
    let sheetCount = 0;
    const rows = baseRows.map((r, idx) => {
      const fresh = freshUrls[idx];
      const logo_url = fresh || r.sheet_logo || '';
      if (fresh) freshCount++;
      else if (r.sheet_logo) sheetCount++;
      return { team_name: r.team_name, id_cartola: r.id_cartola, logo_url };
    });

    console.log(`[copa_mundo] dados externos: ${rows.length} seleções (fresh=${freshCount} sheet=${sheetCount})`);
    return { rows };
  } catch (e: any) {
    console.error(`[copa_mundo] dados_externos erro: ${e.message}`);
    return { rows: [] };
  }
}

async function parseCopaMundoClassificacao(accessToken: string, sheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, sheetId, `'FASE DE GRUPOS'!A1:Y100`);
    const grupos: Record<string, any[]> = {};
    // Esquerda A–L: grupos A–F. Direita N–Y: grupos G–L.
    // Cabeçalhos de grupo nas linhas 3, 9, 15, 21, 27, 33 (idx 2, 8, 14, 20, 26, 32).
    const blockStarts = [2, 8, 14, 20, 26, 32];
    const leftGroups = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rightGroups = ['G', 'H', 'I', 'J', 'K', 'L'];
    // Esquerda: C=2 nome, D=3 P, E=4 J, F=5 V, G=6 E, H=7 D, I=8 GP, K=10 SG
    // Direita:  P=15 nome, Q=16 P, R=17 J, S=18 V, T=19 E, U=20 D, V=21 GP, X=23 SG
    const sides = [
      { groups: leftGroups, name: 2, P: 3, J: 4, V: 5, E: 6, D: 7, GP: 8, SG: 10 },
      { groups: rightGroups, name: 15, P: 16, J: 17, V: 18, E: 19, D: 20, GP: 21, SG: 23 },
    ];
    for (const side of sides) {
      blockStarts.forEach((headerRow, gi) => {
        const groupKey = side.groups[gi];
        const teams: any[] = [];
        for (let t = 1; t <= 4; t++) {
          const row = values[headerRow + t] || [];
          const team_name = cleanStr(row[side.name]);
          if (!team_name) continue;
          teams.push({
            posicao: t,
            team_name,
            pontos: cleanStr(row[side.P]),
            jogos: cleanStr(row[side.J]),
            vitorias: cleanStr(row[side.V]),
            empates: cleanStr(row[side.E]),
            derrotas: cleanStr(row[side.D]),
            gols_pro: cleanStr(row[side.GP]),
            saldo: cleanStr(row[side.SG]),
          });
        }
        if (teams.length > 0) grupos[groupKey] = teams;
      });
    }
    console.log(`[copa_mundo] classificação: ${Object.keys(grupos).length} grupos`);
    return { grupos };
  } catch (e: any) {
    console.error(`[copa_mundo] classificacao erro: ${e.message}`);
    return { grupos: {} };
  }
}

async function parseCopaMundoFaseGruposRodada(accessToken: string, sheetId: string, rodada: number) {
  const tabName = `RDD #${rodada.toString().padStart(2, '0')}`;
  try {
    const values = await fetchSheetRange(accessToken, sheetId, `'${tabName}'!A1:I60`);
    // Cabeçalho de grupo nas linhas 4, 8, 12, ... (idx 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47)
    // 2 confrontos nas 2 linhas abaixo. B=1 casa, C=2 escudo casa, D=3 gols casa,
    // F=5 gols vis, G=6 escudo vis, H=7 nome vis.
    const groupKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const groups: Record<string, { matches: any[] }> = {};
    let order = 1;
    groupKeys.forEach((g, gi) => {
      const headerRow = 3 + gi * 4;
      const matches: any[] = [];
      for (let m = 1; m <= 2; m++) {
        const row = values[headerRow + m] || [];
        const team1 = cleanStr(row[1]);
        const team2 = cleanStr(row[7]);
        if (!team1 && !team2) continue;
        matches.push({
          team1,
          team2,
          score1: cleanStr(row[3]),
          score2: cleanStr(row[5]),
          matchOrder: order++,
        });
      }
      if (matches.length > 0) groups[g] = { matches };
    });
    console.log(`[copa_mundo] fase_grupos rodada ${rodada}: ${Object.keys(groups).length} grupos`);
    return { tournament: 'Copa do Mundo FIFA', round: `Rodada ${rodada}`, groups };
  } catch (e: any) {
    console.error(`[copa_mundo] fase_grupos rodada ${rodada} erro: ${e.message}`);
    return { tournament: 'Copa do Mundo FIFA', round: `Rodada ${rodada}`, groups: {} };
  }
}

async function parseCopaMundoMataMata(accessToken: string, sheetId: string, phaseKey: Exclude<CopaMundoKoPhase, 'final'>) {
  const tab = COPA_MUNDO_KO_TAB[phaseKey];
  const layout = COPA_MUNDO_KO_LAYOUT[phaseKey];
  try {
    const values = await fetchSheetRange(accessToken, sheetId, `'${tab}'!A1:J60`);
    const matches: any[] = [];
    for (const block of layout) {
      const casa = values[block.homeRow] || [];
      const vis = values[block.homeRow + 1] || [];
      const team1 = cleanStr(casa[block.teamCol]);
      const team2 = cleanStr(vis[block.teamCol]);
      if (!team1 && !team2) continue;
      matches.push({
        tipo: 'mata_mata',
        matchNumber: block.matchNumber,
        team1,
        team2,
        scoreIda1: cleanStr(casa[block.scoreCol]),
        scoreVolta1: '',
        scoreIda2: cleanStr(vis[block.scoreCol]),
        scoreVolta2: '',
      });
    }
    matches.sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber));
    console.log(`[copa_mundo][KO][parse]`, { fase: phaseKey, esperado: layout.length, gerado: matches.length });
    return { fase: phaseKey, matches };
  } catch (e: any) {
    console.error(`[copa_mundo] ${phaseKey} erro: ${e.message}`);
    return { fase: phaseKey, matches: [] };
  }
}

async function parseCopaMundoFinal(accessToken: string, sheetId: string) {
  try {
    const values = await fetchSheetRange(accessToken, sheetId, `'FINAL'!A1:J10`);
    const casa = values[4] || [];
    const vis = values[5] || [];
    const sides: Array<{ tipo: 'final' | 'terceiro_lugar'; teamCol: number; scoreCol: number; matchNumber: string }> = [
      { tipo: 'final',          teamCol: 2, scoreCol: 3, matchNumber: 'FINAL' },
      { tipo: 'terceiro_lugar', teamCol: 7, scoreCol: 8, matchNumber: '3º LUGAR' },
    ];
    const matches: any[] = [];
    for (const s of sides) {
      const team1 = cleanStr(casa[s.teamCol]);
      const team2 = cleanStr(vis[s.teamCol]);
      if (!team1 && !team2) continue;
      matches.push({
        tipo: s.tipo,
        matchNumber: s.matchNumber,
        team1,
        team2,
        scoreIda1: cleanStr(casa[s.scoreCol]),
        scoreVolta1: '',
        scoreIda2: cleanStr(vis[s.scoreCol]),
        scoreVolta2: '',
      });
    }
    console.log(`[copa_mundo][KO][parse]`, { fase: 'final', esperado: 2, gerado: matches.length });
    return { fase: 'final', matches, isFinal: true };
  } catch (e: any) {
    console.error(`[copa_mundo] final erro: ${e.message}`);
    return { fase: 'final', matches: [], isFinal: true };
  }
}

// ── Cache builders/mergers (sempre carregam version) ──
const COPA_MUNDO_CACHE_VERSION = 1;

function buildCopaMundoPayload(prev: any, patch: any) {
  const prevFases = prev?.fases ?? {};
  const patchFases = patch?.fases ?? {};
  const fases: Record<string, any> = { ...prevFases, ...patchFases };
  // fase_grupos é objeto com rodada_*: faz merge raso por rodada
  if (prevFases.fase_grupos || patchFases.fase_grupos) {
    fases.fase_grupos = { ...(prevFases.fase_grupos ?? {}), ...(patchFases.fase_grupos ?? {}) };
  }
  return {
    version: COPA_MUNDO_CACHE_VERSION,
    synced_at: new Date().toISOString(),
    fases,
    classificacao: patch?.classificacao ?? prev?.classificacao ?? { grupos: {} },
    dados_externos: patch?.dados_externos ?? prev?.dados_externos ?? { rows: [] },
  };
}

function logCopaMundoSync(scope: string, extra: Record<string, any>, payload: any) {
  console.log('[copa_mundo][sync]', {
    scope,
    ...extra,
    version: payload?.version,
    grupos: Object.keys(payload?.classificacao?.grupos ?? {}).length,
    dados_externos: (payload?.dados_externos?.rows ?? []).length,
    fases_keys: Object.keys(payload?.fases ?? {}),
    fase_grupos_rodadas: Object.keys(payload?.fases?.fase_grupos ?? {}),
  });
}

async function syncCopaMundoAll(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const sheetId = getCopaMundoSheetId();
  const dadosExternos = await parseCopaMundoDadosExternos(accessToken, sheetId);
  const classificacao = await parseCopaMundoClassificacao(accessToken, sheetId);
  const fase_grupos: Record<string, any> = {};
  for (const r of [1, 2, 3]) {
    fase_grupos[`rodada_${r}`] = await parseCopaMundoFaseGruposRodada(accessToken, sheetId, r);
  }
  const fases: Record<string, any> = { fase_grupos };
  for (const phase of ['16avos', 'oitavas', 'quartas', 'semifinal'] as const) {
    fases[phase] = await parseCopaMundoMataMata(accessToken, sheetId, phase);
  }
  fases.final = await parseCopaMundoFinal(accessToken, sheetId);

  const payload = buildCopaMundoPayload(null, { fases, classificacao, dados_externos: dadosExternos });
  logCopaMundoSync('copa_mundo_all', {}, payload);
  const result = await upsertCache(supabaseAdmin, 'copa_mundo', 'copa_mundo', payload, syncedBy);
  return [result];
}

async function syncCopaMundoRodada(accessToken: string, rodada: number, syncedBy: string, supabaseAdmin: any) {
  if (!rodada || rodada < 1 || rodada > 3) {
    throw new Error('[copa_mundo] rodada inválida (1-3)');
  }
  const sheetId = getCopaMundoSheetId();
  const { data: existingRow } = await supabaseAdmin
    .from('sheets_cache').select('data').eq('cache_key', 'copa_mundo').maybeSingle();

  if (!existingRow?.data || existingRow.data.version !== COPA_MUNDO_CACHE_VERSION) {
    console.log('[copa_mundo] cache ausente/versão inválida — executando fallback copa_mundo_all');
    return syncCopaMundoAll(accessToken, syncedBy, supabaseAdmin);
  }
  const novaRodada = await parseCopaMundoFaseGruposRodada(accessToken, sheetId, rodada);
  const novaClass = await parseCopaMundoClassificacao(accessToken, sheetId);
  const patch = {
    fases: { fase_grupos: { ...(existingRow.data.fases?.fase_grupos ?? {}), [`rodada_${rodada}`]: novaRodada } },
    classificacao: novaClass.grupos && Object.keys(novaClass.grupos).length ? novaClass : existingRow.data.classificacao,
  };
  const payload = buildCopaMundoPayload(existingRow.data, patch);
  logCopaMundoSync('copa_mundo_rodada', { rodada }, payload);
  const result = await upsertCache(supabaseAdmin, 'copa_mundo', 'copa_mundo', payload, syncedBy);
  return [result];
}

async function syncCopaMundoDadosExternos(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const sheetId = getCopaMundoSheetId();
  const { data: existingRow } = await supabaseAdmin
    .from('sheets_cache').select('data').eq('cache_key', 'copa_mundo').maybeSingle();
  if (!existingRow?.data || existingRow.data.version !== COPA_MUNDO_CACHE_VERSION) {
    return syncCopaMundoAll(accessToken, syncedBy, supabaseAdmin);
  }
  const novos = await parseCopaMundoDadosExternos(accessToken, sheetId);
  if (!novos.rows.length) throw new Error('[copa_mundo][sync-error] dados_externos vazio');
  const payload = buildCopaMundoPayload(existingRow.data, { dados_externos: novos });
  logCopaMundoSync('copa_mundo_dados_externos', {}, payload);
  const result = await upsertCache(supabaseAdmin, 'copa_mundo', 'copa_mundo', payload, syncedBy);
  return [result];
}

async function syncCopaMundoFaseKO(accessToken: string, phaseKey: string, syncedBy: string, supabaseAdmin: any) {
  if (!COPA_MUNDO_KO_PHASES.includes(phaseKey as any)) {
    throw new Error(`[copa_mundo] fase inválida: ${phaseKey}. Use: ${COPA_MUNDO_KO_PHASES.join(', ')}`);
  }
  const sheetId = getCopaMundoSheetId();
  const { data: existingRow } = await supabaseAdmin
    .from('sheets_cache').select('data').eq('cache_key', 'copa_mundo').maybeSingle();
  if (!existingRow?.data || existingRow.data.version !== COPA_MUNDO_CACHE_VERSION) {
    return syncCopaMundoAll(accessToken, syncedBy, supabaseAdmin);
  }
  const novaFase = phaseKey === 'final'
    ? await parseCopaMundoFinal(accessToken, sheetId)
    : await parseCopaMundoMataMata(accessToken, sheetId, phaseKey as Exclude<CopaMundoKoPhase, 'final'>);
  const patch = { fases: { [phaseKey]: novaFase } };
  const payload = buildCopaMundoPayload(existingRow.data, patch);
  logCopaMundoSync('copa_mundo_fase_ko', { phaseKey }, payload);
  const result = await upsertCache(supabaseAdmin, 'copa_mundo', 'copa_mundo', payload, syncedBy);
  return [result];
}

// ─── Sync orchestrators ───



const COPA_FASES = ["1ª Fase", "2ª Fase", "Oitavas de Final", "Quartas de Final", "Semifinal", "Final"];
const LIBERTADORES_KNOCKOUT_FASES = ["Oitavas de Final", "Quartas de Final", "Semifinal", "Final"];
const INTERCONTINENTAL_FASES = ["Quartas de Final", "Semifinal", "Final"];

async function syncLeague(accessToken: string, league: string, maxRodada: number, syncedBy: string, supabaseAdmin: any) {
  const spreadsheetId = getLeagueSpreadsheetId(league);
  const results: any[] = [];

  // Classificação
  const classData = await parseClassificacao(accessToken, spreadsheetId);
  results.push(await upsertCache(supabaseAdmin, `classificacao:${league}`, "classificacao", classData, syncedBy));

  // Dados Externos
  const extData = await parseDadosExternos(accessToken, spreadsheetId);
  results.push(await upsertCache(supabaseAdmin, `dados_externos:${league}`, "dados_externos", extData, syncedBy));

  // Resultados por rodada
  for (let r = 1; r <= maxRodada; r++) {
    try {
      const resData = await parseResultados(accessToken, spreadsheetId, r);
      results.push(await upsertCache(supabaseAdmin, `resultados:${league}:${r}`, "resultados", resData, syncedBy));
    } catch (e: any) {
      results.push({ cache_key: `resultados:${league}:${r}`, status: "error", error: e.message });
    }
  }
  return results;
}

async function syncCopa(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const copaId = Deno.env.get("GOOGLE_SPREADSHEET_ID_COPA_BR");
  if (!copaId) throw new Error("GOOGLE_SPREADSHEET_ID_COPA_BR is not configured");

  const fases: Record<string, any> = {};
  const errors: Array<{ item: string; message: string }> = [];
  for (const fase of COPA_FASES) {
    try { fases[fase] = await parseConfrontosCopa(accessToken, copaId, fase); } catch (e: any) { fases[fase] = null; errors.push({ item: fase, message: e.message }); }
  }
  let dadosExternos = null;
  try { dadosExternos = await parseCopaBaseDados(accessToken, copaId); } catch (e: any) { errors.push({ item: "dados_externos", message: e.message }); }
  const data = { fases, dados_externos: dadosExternos };
  const result = await upsertCache(supabaseAdmin, "copa:brasil", "copa", data, syncedBy);
  return [errors.length > 0 ? { ...result, errors } : result];
}

async function syncLibertadoresOrSulamericana(accessToken: string, tournament: string, syncedBy: string, supabaseAdmin: any) {
  const isSulamericana = tournament === "sulamericana";
  const envKey = isSulamericana ? "GOOGLE_SPREADSHEET_ID_SULAMERICANA" : "GOOGLE_SPREADSHEET_ID_LIBERTADORES";
  const sheetId = Deno.env.get(envKey);
  if (!sheetId) throw new Error(`${envKey} is not configured`);

  const errors: Array<{ item: string; message: string }> = [];

  // Groups (rounds 1-6)
  const grupos: Record<string, any> = {};
  for (let r = 1; r <= 6; r++) {
    try { grupos[`rodada_${r}`] = await parseLibertadoresGrupos(accessToken, sheetId, r, isSulamericana); } catch (e: any) { grupos[`rodada_${r}`] = null; errors.push({ item: `rodada_${r}`, message: e.message }); }
  }

  // Classificação
  let classificacao = null;
  try { classificacao = await parseLibertadoresClassificacao(accessToken, sheetId, isSulamericana); } catch (e: any) { errors.push({ item: "classificacao", message: e.message }); }

  // Knockout phases
  const fases: Record<string, any> = {};
  for (const fase of LIBERTADORES_KNOCKOUT_FASES) {
    const cols = fase === "Final" ? LIBERTADORES_COLUMNS : COPA_COLUMNS;
    try { fases[fase] = await parseConfrontosCopa(accessToken, sheetId, fase, cols); } catch (e: any) { fases[fase] = null; errors.push({ item: fase, message: e.message }); }
  }

  // Dados externos
  let dadosExternos = null;
  try { dadosExternos = await parseDadosExternos(accessToken, sheetId); } catch (e: any) { errors.push({ item: "dados_externos", message: e.message }); }

  const cacheKey = isSulamericana ? "sulamericana" : "libertadores";
  const data = { grupos, classificacao, fases, dados_externos: dadosExternos };
  const result = await upsertCache(supabaseAdmin, cacheKey, "copa", data, syncedBy);
  return [errors.length > 0 ? { ...result, errors } : result];
}

async function syncContinentalDadosExternos(accessToken: string, tournament: string, syncedBy: string, supabaseAdmin: any) {
  const isSulamericana = tournament === "sulamericana";
  const envKey = isSulamericana ? "GOOGLE_SPREADSHEET_ID_SULAMERICANA" : "GOOGLE_SPREADSHEET_ID_LIBERTADORES";
  const sheetId = Deno.env.get(envKey);
  if (!sheetId) throw new Error(`${envKey} is not configured`);

  const cacheKey = isSulamericana ? "sulamericana" : "libertadores";

  const { data: existingRow } = await supabaseAdmin
    .from("sheets_cache")
    .select("data")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (!existingRow?.data) {
    console.log(`[${tournament}] cache inexistente — executando rebuild completo`);
    return syncLibertadoresOrSulamericana(accessToken, tournament, syncedBy, supabaseAdmin);
  }

  const novosDadosExternos = await parseDadosExternos(accessToken, sheetId);
  if (!novosDadosExternos?.rows?.length) {
    throw new Error(`[${tournament}][sync-error] dados_externos vazio`);
  }

  const merged = { ...existingRow.data, dados_externos: novosDadosExternos };

  const result = await upsertCache(supabaseAdmin, cacheKey, "copa", merged, syncedBy);
  return [result];
}

async function syncIntercontinental(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const sheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID_INTERCONTINENTAL");
  if (!sheetId) throw new Error("GOOGLE_SPREADSHEET_ID_INTERCONTINENTAL is not configured");

  const errors: Array<{ item: string; message: string }> = [];
  const fases: Record<string, any> = {};
  for (const fase of INTERCONTINENTAL_FASES) {
    try { fases[fase] = await parseIntercontinentalConfrontos(accessToken, sheetId, fase); } catch (e: any) { fases[fase] = null; errors.push({ item: fase, message: e.message }); }
  }

  let dadosExternos = null;
  try {
    const values = await fetchSheetRange(accessToken, sheetId, "'DADOS EXTERNOS'!A:C");
    dadosExternos = { headers: values.length > 0 ? values[0] : [], rows: values.length > 1 ? values.slice(1) : [], raw: values };
  } catch (e: any) { errors.push({ item: "dados_externos", message: e.message }); }

  const data = { fases, dados_externos: dadosExternos };
  const result = await upsertCache(supabaseAdmin, "intercontinental", "copa", data, syncedBy);
  return [errors.length > 0 ? { ...result, errors } : result];
}

async function syncRankingLiga(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const ligaId = Deno.env.get("GOOGLE_SPREADSHEET_ID_LIGA");
  if (!ligaId) return [];

  const periodos = ["ANUAL", "1º TURNO", "2º TURNO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  const results: any[] = [];
  const badgeMap = await loadLigaBadgeMap(supabaseAdmin);
  for (const p of periodos) {
    try {
      const data = await parseRankingLiga(accessToken, ligaId, p, badgeMap);
      results.push(await upsertCache(supabaseAdmin, `ranking_liga:${p}`, "classificacao", data, syncedBy));
    } catch (_e) {
      results.push({ cache_key: `ranking_liga:${p}`, status: "error", error: (_e as Error).message });
    }
  }
  return results;
}

async function syncLigaDadosExternos(accessToken: string, syncedBy: string, supabaseAdmin: any) {
  const ligaId = Deno.env.get("GOOGLE_SPREADSHEET_ID_LIGA");
  if (!ligaId) throw new Error("GOOGLE_SPREADSHEET_ID_LIGA is not configured");

  const extData = await parseDadosExternos(accessToken, ligaId);
  if (!extData?.rows?.length) {
    throw new Error("[liga_classica][sync-error] dados_externos vazio");
  }

  const result = await upsertCache(supabaseAdmin, "dados_externos:liga_classica", "dados_externos", extData, syncedBy);
  return [result];
}



// ─── Smart sync helpers ───

const COPA_RODADAS = [5, 7, 13, 16, 21, 22, 25, 26, 34, 35, 38];
const LIBERTA_SULA_RODADAS = [11, 12, 14, 15, 17, 18, 23, 24, 27, 28, 31, 32, 37];
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

async function syncLeagueRound(accessToken: string, league: string, rodada: number, syncedBy: string, supabaseAdmin: any) {
  const spreadsheetId = getLeagueSpreadsheetId(league);
  const results: any[] = [];

  // Classificação
  const classData = await parseClassificacao(accessToken, spreadsheetId);
  results.push(await upsertCache(supabaseAdmin, `classificacao:${league}`, "classificacao", classData, syncedBy));

  // Resultados da rodada
  try {
    const resData = await parseResultados(accessToken, spreadsheetId, rodada);
    results.push(await upsertCache(supabaseAdmin, `resultados:${league}:${rodada}`, "resultados", resData, syncedBy));
  } catch (e: any) {
    results.push({ cache_key: `resultados:${league}:${rodada}`, status: "error", error: e.message });
  }

  return results;
}

async function syncRankingLigaSmart(accessToken: string, rodada: number, syncedBy: string, supabaseAdmin: any) {
  const ligaId = Deno.env.get("GOOGLE_SPREADSHEET_ID_LIGA");
  if (!ligaId) return [];

  const results: any[] = [];
  const periodos: string[] = ["ANUAL"];

  // Turno
  if (rodada <= 19) periodos.push("1º TURNO");
  if (rodada >= 20) periodos.push("2º TURNO");

  // Mês atual
  const mesAtual = MESES[new Date().getMonth()];
  if (mesAtual && !periodos.includes(mesAtual)) periodos.push(mesAtual);

  const badgeMap = await loadLigaBadgeMap(supabaseAdmin);
  for (const p of periodos) {
    try {
      const data = await parseRankingLiga(accessToken, ligaId, p, badgeMap);
      results.push(await upsertCache(supabaseAdmin, `ranking_liga:${p}`, "classificacao", data, syncedBy));
    } catch (e: any) {
      results.push({ cache_key: `ranking_liga:${p}`, status: "error", error: (e as Error).message });
    }
  }
  return results;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roleData } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado — apenas admins" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse params
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");
    const league = url.searchParams.get("league") || "serie_a";
    const rodadaParam = url.searchParams.get("rodada");
    const tournament = url.searchParams.get("tournament");
    const fase = url.searchParams.get("fase");

    if (!scope) throw new Error('Parâmetro "scope" é obrigatório');

    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY is not configured");

    const accessToken = await getAccessToken(privateKey);
    let allResults: any[] = [];

    if (scope === "smart") {
      // ── Smart sync: only what changes per round ──
      const rodada = parseInt(rodadaParam!, 10);
      if (!rodada || rodada < 1 || rodada > 38) throw new Error("rodada obrigatória (1-38) para scope=smart");

      // Leagues in parallel: resultados + classificação only
      const leagueResults = await Promise.all(
        ["serie_a", "serie_b", "serie_c"].map((l) =>
          syncLeagueRound(accessToken, l, rodada, userId, supabaseAdmin)
            .catch((e) => [{ cache_key: `league_round:${l}`, status: "error", error: e.message }])
        )
      );
      allResults.push(...leagueResults.flat());

      // Tournaments (conditional by round)
      const tournamentPromises: Promise<any[]>[] = [];
      if (COPA_RODADAS.includes(rodada)) {
        tournamentPromises.push(syncCopa(accessToken, userId, supabaseAdmin).catch((e) => [{ cache_key: "copa:brasil", status: "error", error: e.message }]));
      }
      if (LIBERTA_SULA_RODADAS.includes(rodada)) {
        tournamentPromises.push(
          syncLibertadoresOrSulamericana(accessToken, "libertadores", userId, supabaseAdmin).catch((e) => [{ cache_key: "libertadores", status: "error", error: e.message }]),
          syncLibertadoresOrSulamericana(accessToken, "sulamericana", userId, supabaseAdmin).catch((e) => [{ cache_key: "sulamericana", status: "error", error: e.message }]),
        );
      }
      if (tournamentPromises.length > 0) {
        const tResults = await Promise.all(tournamentPromises);
        allResults.push(...tResults.flat());
      }

      // Liga Clássica ranking (smart)
      const rankingResults = await syncRankingLigaSmart(accessToken, rodada, userId, supabaseAdmin);
      allResults.push(...rankingResults);

    } else if (scope === "rodada") {
      // Single round results
      const rodada = parseInt(rodadaParam!, 10);
      if (!rodada || rodada < 1 || rodada > 38) throw new Error("rodada obrigatória (1-38) para scope=rodada");
      const spreadsheetId = getLeagueSpreadsheetId(league);
      const resData = await parseResultados(accessToken, spreadsheetId, rodada);
      allResults.push(await upsertCache(supabaseAdmin, `resultados:${league}:${rodada}`, "resultados", resData, userId));

    } else if (scope === "classificacao") {
      const spreadsheetId = getLeagueSpreadsheetId(league);
      const classData = await parseClassificacao(accessToken, spreadsheetId);
      allResults.push(await upsertCache(supabaseAdmin, `classificacao:${league}`, "classificacao", classData, userId));

    } else if (scope === "dados_externos") {
      const spreadsheetId = getLeagueSpreadsheetId(league);
      const extData = await parseDadosExternos(accessToken, spreadsheetId);
      allResults.push(await upsertCache(supabaseAdmin, `dados_externos:${league}`, "dados_externos", extData, userId));

    } else if (scope === "confrontos") {
      // Heavy bootstrap: all 38 rounds
      const spreadsheetId = getLeagueSpreadsheetId(league);
      for (let r = 1; r <= 38; r++) {
        try {
          const resData = await parseResultados(accessToken, spreadsheetId, r);
          allResults.push(await upsertCache(supabaseAdmin, `resultados:${league}:${r}`, "resultados", resData, userId));
        } catch (e: any) {
          allResults.push({ cache_key: `resultados:${league}:${r}`, status: "error", error: e.message });
        }
      }

    } else if (scope === "ranking") {
      allResults = await syncRankingLiga(accessToken, userId, supabaseAdmin);

    } else if (scope === "league") {
      const maxRodada = rodadaParam ? parseInt(rodadaParam, 10) : 38;
      allResults = await syncLeague(accessToken, league, maxRodada, userId, supabaseAdmin);
    } else if (scope === "tournament") {
      if (!tournament) throw new Error('Parâmetro "tournament" é obrigatório para scope=tournament');
      if (tournament === "copa") allResults = await syncCopa(accessToken, userId, supabaseAdmin);
      else if (tournament === "libertadores" || tournament === "sulamericana") allResults = await syncLibertadoresOrSulamericana(accessToken, tournament, userId, supabaseAdmin);
      else if (tournament === "intercontinental") allResults = await syncIntercontinental(accessToken, userId, supabaseAdmin);
      else if (tournament === "campeoes") allResults = await syncCampeoes(accessToken, userId, supabaseAdmin);
      else if (tournament === "copa_mundo") allResults = await syncCopaMundoAll(accessToken, userId, supabaseAdmin);
      else throw new Error(`Torneio desconhecido: ${tournament}`);
    } else if (scope === "campeoes_all") {
      allResults = await syncCampeoesAll(accessToken, userId, supabaseAdmin);
    } else if (scope === "campeoes_rodada") {
      const rodada = parseInt(rodadaParam!, 10);
      if (!rodada || rodada < 1 || rodada > 8) throw new Error("rodada obrigatória (1-8) para scope=campeoes_rodada");
      allResults = await syncCampeoesRodada(accessToken, rodada, userId, supabaseAdmin);
    } else if (scope === "campeoes_dados_externos") {
      allResults = await syncCampeoesDadosExternos(accessToken, userId, supabaseAdmin);
    } else if (scope === "campeoes_fase_ko") {
      if (!fase) throw new Error('Parâmetro "fase" é obrigatório para scope=campeoes_fase_ko');
      allResults = await syncCampeoesFaseKO(accessToken, fase, userId, supabaseAdmin);
    } else if (scope === "copa_mundo_all") {
      allResults = await syncCopaMundoAll(accessToken, userId, supabaseAdmin);
    } else if (scope === "copa_mundo_rodada") {
      const rodada = parseInt(rodadaParam!, 10);
      if (!rodada || rodada < 1 || rodada > 3) throw new Error("rodada obrigatória (1-3) para scope=copa_mundo_rodada");
      allResults = await syncCopaMundoRodada(accessToken, rodada, userId, supabaseAdmin);
    } else if (scope === "copa_mundo_dados_externos") {
      allResults = await syncCopaMundoDadosExternos(accessToken, userId, supabaseAdmin);
    } else if (scope === "libertadores_dados_externos") {
      allResults = await syncContinentalDadosExternos(accessToken, "libertadores", userId, supabaseAdmin);
    } else if (scope === "sulamericana_dados_externos") {
      allResults = await syncContinentalDadosExternos(accessToken, "sulamericana", userId, supabaseAdmin);
    } else if (scope === "liga_dados_externos") {
      allResults = await syncLigaDadosExternos(accessToken, userId, supabaseAdmin);

    } else if (scope === "copa_mundo_fase_ko") {
      if (!fase) throw new Error('Parâmetro "fase" é obrigatório para scope=copa_mundo_fase_ko');
      allResults = await syncCopaMundoFaseKO(accessToken, fase, userId, supabaseAdmin);
    } else if (scope === "all") {
      const leagues = ["serie_a", "serie_b", "serie_c"];
      const maxRodada = rodadaParam ? parseInt(rodadaParam, 10) : 38;

      const leagueResults = await Promise.all(leagues.map((l) => syncLeague(accessToken, l, maxRodada, userId, supabaseAdmin).catch((e) => [{ cache_key: `league:${l}`, status: "error", error: e.message }])));
      allResults.push(...leagueResults.flat());

      const tournamentResults = await Promise.all([
        syncCopa(accessToken, userId, supabaseAdmin).catch((e) => [{ cache_key: "copa:brasil", status: "error", error: e.message }]),
        syncLibertadoresOrSulamericana(accessToken, "libertadores", userId, supabaseAdmin).catch((e) => [{ cache_key: "libertadores", status: "error", error: e.message }]),
        syncLibertadoresOrSulamericana(accessToken, "sulamericana", userId, supabaseAdmin).catch((e) => [{ cache_key: "sulamericana", status: "error", error: e.message }]),
        syncIntercontinental(accessToken, userId, supabaseAdmin).catch((e) => [{ cache_key: "intercontinental", status: "error", error: e.message }]),
        syncRankingLiga(accessToken, userId, supabaseAdmin).catch((e) => [{ cache_key: "ranking_liga", status: "error", error: e.message }]),
      ]);
      allResults.push(...tournamentResults.flat());
    } else {
      throw new Error(`Scope inválido: ${scope}`);
    }

    const ok = allResults.filter((r) => r.status === "ok").length;
    const errCount = allResults.filter((r) => r.status === "error").length;

    const detailedErrors: Array<{ cache_key: string; item: string; message: string }> = [];
    for (const r of allResults) {
      if (r.errors) {
        for (const e of r.errors) {
          detailedErrors.push({ cache_key: r.cache_key, item: e.item, message: e.message });
        }
      }
    }

    return new Response(JSON.stringify({
      summary: { total: allResults.length, ok, errors: errCount, partial_errors: detailedErrors.length },
      results: allResults,
      ...(detailedErrors.length > 0 ? { errors: detailedErrors } : {}),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-sheets error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
