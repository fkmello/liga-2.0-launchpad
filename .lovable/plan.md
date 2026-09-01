# Auditoria: por que a R24 sumiu do payload consolidado da Série A

Nenhuma alteração foi feita. Abaixo, só evidências lidas do banco e do código.

## 1. Estado atual — `shadow/brasileirao_serie_a/2026` (synced_at 2026-09-01 14:20:05 UTC)

| Rodada | Existe? | Confrontos | Com placar |
|---|---|---|---|
| R22 | sim | 10 | 10 |
| R23 | sim | 10 | 10 |
| R24 | sim | 10 | **0** |
| R25 | sim | 10 | 10 |
| R26 | sim | 10 | 0 (mercado aberto) |

A R24 não desapareceu como estrutura: os 10 confrontos existem, mas `score1`/`score2` estão vazios. O problema está no banco, não no frontend.

## 2. Execução de hoje

- `market_opened_at` 14:00:02 UTC, `current_round = 26`, `market_status = 1`.
- `first_sync_at` 14:20:05 UTC (SYNC_1) — mesmo timestamp do `synced_at` da chave shadow: foi essa execução que gravou o payload atual.
- `second_sync_done = true`, `last_sync_phase = SYNC_2`, `last_sync_status = SKIPPED`, sem erro. Rodadas seguintes do cron (17:00) retornam `SKIP_DONE`.
- Regra do adapter com `status_mercado = 1`: `targetRound = rodada_atual - 1 = 25`. Confirmado pelos dados: a chave legada `resultados:serie_a:25` continua **sem placar** (synced_at de março), enquanto o shadow tem R25 com 10 placares — ou seja, os placares da R25 vieram da API do Cartola nessa execução e foram persistidos.

## 3. Como o payload é persistido — Opção C (reconstrução a partir da planilha, com sobreposição de uma rodada)

Cadeia real:

1. `sync-tournament-api` usa `createShadowRepository`.
2. `shadowRepository.load()` **não lê a chave shadow existente**. Ele chama `readLegacyTournament`, que monta o baseline a partir das chaves legadas da planilha (`classificacao:serie_a`, `dados_externos:serie_a`, `resultados:serie_a:1..38`).
3. Esse baseline vira `ctx.previous`. O adapter copia `prevFases` e substitui apenas os placares da `targetRound`.
4. `mergeTournamentPayload` faz merge de `prev` (= o mesmo baseline legado) com `next` — nunca com o conteúdo já gravado no shadow.
5. `save()` sobrescreve a chave shadow inteira.

Logo: **cada execução reconstrói o payload a partir da planilha e só a rodada-alvo recebe dados da API.** Tudo que a API escreveu em execuções anteriores é descartado.

## 4. Onde a R24 se perdeu

Chaves legadas hoje:

| Chave legada | Confrontos | Com placar | synced_at |
|---|---|---|---|
| `resultados:serie_a:22` | 10 | 10 | 18/08 |
| `resultados:serie_a:23` | 10 | 10 | 18/08 |
| `resultados:serie_a:24` | 10 | **0** | 25/08 |
| `resultados:serie_a:25` | 10 | 0 | 26/03 |

A R24 nunca teve placar na planilha. Ela estava correta no shadow porque a execução anterior (semana de 25/08) teve `targetRound = 24` e escreveu os placares vindos da API. Na execução de hoje, `targetRound = 25`; o baseline legado trouxe a R24 vazia e ela foi regravada vazia.

Ponto exato da perda: **carga do baseline (`load`) / merge** — a R24 já entra vazia em memória. Não é coleta da API, não é cache do frontend.

## 5. Comparação antes/depois

Não há histórico versionado da chave shadow (`sheets_cache` guarda apenas a linha atual). Não é possível recuperar o conteúdo anterior literalmente. A inferência acima é sustentada por: `synced_at` da chave = horário do SYNC_1 de hoje, R25 com placar que não existe em nenhuma chave legada, e R24 vazia exatamente como a chave legada correspondente.

## 6. Construção de `fases`

`extractMatches` no adapter parte de `ctx.previous.fases` (baseline legado), copia tudo e reescreve apenas `rodada_{targetRound}` com os placares da API. Não há `slice`/`filter` removendo rodadas — a exclusão é por origem do baseline, não por filtro.

## 7. Fonte das rodadas históricas

Planilha (chaves legadas) para fixtures e placares históricos; API Cartola apenas para a rodada-alvo; o payload shadow existente **não** é consultado. Por isso qualquer rodada cujo placar exista só no shadow é perdida na execução seguinte.

## 8. Causa comum com o episódio da R22

Sim, é a mesma linha de código: `shadowRepository.load()` apontando para o baseline legado em vez do próprio shadow. Toda rodada preenchida exclusivamente pela API é efêmera até que a planilha a preencha.

## 9/10. Frontend e classificação

O frontend lê `shadow/brasileirao_serie_a/2026` (`getTournamentCacheKey`, stage `shadow`). Como a R24 está sem placar no banco, é backend/persistência — não React Query. A classificação é recalculada sobre as fases do payload, então a R24 sem placar não conta como jogo disputado: daí os 24 jogos exibidos em vez de 25.

## Respostas objetivas

- **A)** R24 está no banco? SIM, mas sem placares.
- **B)** Estava preenchida antes da execução da R25? Muito provavelmente SIM (preenchida pela API na sync de ~25/08); não é possível provar por snapshot, apenas por inferência de fluxo.
- **C)** R25 foi buscada na API e persistida? SIM.
- **D)** Reconstrói ou faz merge? Reconstrói a partir da planilha e sobrepõe só a rodada-alvo; o merge usa o baseline legado, não o shadow.
- **E)** Onde a R24 é perdida? Na carga do baseline / merge.
- **F)** Causa estrutural comum com a R22? SIM — mesma origem de baseline.
- **G)** Menor correção proposta (não implementar agora): fazer `shadowRepository.load()` ler primeiro a própria chave `shadow/{league}/{season}` e usar o baseline legado apenas como fallback quando a chave shadow não existir (opcionalmente com merge por rodada preferindo o lado que tem placar). Isso preserva R22–R24, adiciona R25 e torna cada nova rodada cumulativa.

## Próximo passo

Nenhuma alteração até sua aprovação. Se aprovar, implemento apenas o item G, sem tocar em adapter, cron, frontend ou dados.
