# Correção: Shadow cumulativo (Série A) — item G

Causa confirmada: `shadowRepository.load()` reconstrói o baseline a partir das chaves legadas da planilha e ignora o payload shadow já gravado. Rodadas consolidadas só pela API (R22 antes, R24 agora) voltam vazias na execução seguinte.

## O que será alterado

Escopo restrito ao ShadowRepository + testes. Nada de cron, adapter, `currentRound - 1`, feature flag, frontend ou outros torneios.

1. **Novo arquivo** `supabase/functions/_shared/cache/roundPreservation.ts`
   - `countScoredMatches(fase)` / `countMatches(fase)`.
   - `mergeFasesPreservingScores(prev, next)`: por rodada, vence o lado com mais placares consolidados; empate em placares → mais confrontos; empate total → `next`.

2. **`supabase/functions/_shared/cache/shadowRepository.ts`**
   - `load()` passa a ler primeiro a própria chave `shadow/{league}/{season}`.
     - Shadow existe e é válido → baseline = shadow, e quando o legado também existir, as `fases` são combinadas com `mergeFasesPreservingScores(legado, shadow)`, de modo que uma rodada vazia no legado nunca sobrescreve uma rodada com placares no shadow. `classificacao`/`dados_externos` seguem o shadow quando não vazios, com fallback para o legado.
     - Shadow ausente/inválido → fallback para o baseline legado atual (fluxo de primeira criação e novas temporadas intacto).
   - `save()` ganha uma trava final: antes de gravar, as `fases` do payload são combinadas com as `fases` já persistidas no shadow usando a mesma regra de preservação. Assim, mesmo que uma etapa anterior produza uma rodada vazia, o banco nunca perde placares já consolidados. O curto-circuito por hash e o `type`/`synced_by` continuam iguais.

3. **Testes** — novo `src/test/shadowRepository.test.ts` (Vitest), com repositório em memória simulando `sheets_cache`:
   - T1 preservação histórica: R22/R23/R24 preenchidas + sync da R25 → as quatro preenchidas.
   - T2 reprodução do bug: shadow R24 com placares + legado R24 sem placares + sync R25 → R24 continua com placares.
   - T3 primeira criação: shadow inexistente + legado disponível → shadow criado normalmente.
   - T4 nova rodada: R22–R24 intactas e R25 acrescentada.
   - T5 rodada-alvo: `currentRound = 26`, `status_mercado = 1` → `targetRound = 25` (apenas verificação da lógica existente do adapter, sem alterá-la).

## Evidências que serão entregues

Arquivos alterados, resumo da mudança, saída do Vitest (total de testes passando) e typecheck. Nenhuma sincronização manual, nenhum `scope=all`, nenhum reparo da R24 atual — isso fica para uma etapa posterior, após sua revisão.
