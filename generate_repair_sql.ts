import { readFileSync } from 'fs';

async function run() {
  const input = readFileSync(0, 'utf-8');
  const rows = JSON.parse(input);
  if (!rows || rows.length === 0) {
    console.error('Nenhum dado recebido');
    process.exit(1);
  }
  
  const payload = rows[0].data;
  const rodada22 = payload.fases.rodada_22;
  const externalData = payload.dados_externos || {};
  
  const teamsMap = new Map();
  (externalData.rows || []).forEach(row => {
    const name = row[0];
    const id = row[1]; // O ID está na segunda coluna agora
    if (name && id && /^\d+$/.test(id)) {
      teamsMap.set(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''), id);
    }
  });

  console.error(`Buscando pontuações para ${teamsMap.size} times...`);
  const scores = new Map();
  const ids = Array.from(teamsMap.values());
  
  // Buscar na API do Cartola
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.cartola.globo.com/time/id/${id}/22`);
      const json: any = await res.json();
      if (json.pontos !== undefined) scores.set(id, json.pontos);
    } catch (e) {}
  }

  let matchesUpdated = 0;
  rodada22.matches = rodada22.matches.map((m: any) => {
    const home = m.team1.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const away = m.team2.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const s1 = scores.get(teamsMap.get(home));
    const s2 = scores.get(teamsMap.get(away));
    
    if (s1 !== undefined || s2 !== undefined) {
      matchesUpdated++;
      return {
        ...m,
        score1: s1 !== undefined ? s1.toFixed(2).replace('.', ',') : m.score1,
        score2: s2 !== undefined ? s2.toFixed(2).replace('.', ',') : m.score2
      };
    }
    return m;
  });

  console.error(`Atualizados ${matchesUpdated} confrontos.`);

  // Gerar o SQL de UPDATE final
  const jsonString = JSON.stringify(payload).replace(/'/g, "''");
  const sql = `UPDATE public.sheets_cache SET data = '${jsonString}'::jsonb, synced_at = now(), synced_by = '7912673a-58bd-4e8c-8aaa-4f9cab1914bc' WHERE cache_key = 'shadow/brasileirao_serie_a/2026';`;
  
  process.stdout.write(sql);
}

run();
