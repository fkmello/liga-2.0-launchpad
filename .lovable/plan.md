# Preparação da Série B no pipeline consolidado

## Estado confirmado

- Ainda não existe `shadow/brasileirao_serie_b/2026` nem estado automático da Série B em `tournament_sync_state`.
- O legado possui 38 rodadas: R1–R28 com 10/10 placares e R29–R38 com 10 confrontos sem placares.
- `dados_externos:serie_b` contém 20 participantes e 20 linhas com ID Cartola; a classificação legada está disponível.
- A leitura do baseline da Série B já existe em `legacy/strategies.ts`; `ShadowRepository` e `roundPreservation.ts` já são genéricos e não serão alterados.

## Implementação

1. **Adapter isolado da Série B**
   - Criar `supabase/functions/_shared/providers/cartola-brasileirao/adapter-serie-b.ts` como uma instância fina do adapter existente, alterando somente o ID para `cartola_brasileirao_serie_b_v1`.
   - Reutilizar integralmente o provider `cartola_brasileirao` e as funções atuais de status, IDs, pontuações, escudos e confrontos.
   - Não modificar o adapter nem o comportamento da Série A; a regra validada permanece: mercado fechado → rodada atual, mercado aberto → rodada atual − 1.

2. **Registry da Série B**
   - Adicionar `brasileirao_serie_b` em `supabase/functions/_shared/tournament/registry.ts`, seguindo os campos da Série A: temporada 2026, API ativa, persistência Shadow, preset CBF e adapter próprio da B.
   - Configurar `cron.enabled: false`, conforme decidido, para impedir entrada automática no dispatcher nesta etapa.
   - Não alterar as definições da Série A, Copa do Mundo ou Série C.

3. **Preparação futura do frontend, ainda desligada**
   - Adicionar `USE_CONSOLIDATED_SERIE_B = false` em `src/config/featureFlags.ts`.
   - Mapear `serie_b` para `brasileirao_serie_b` e para o estágio Shadow em `src/config/tournamentCacheKeys.ts`.
   - Fazer `src/hooks/useTournamentPayload.ts` reconhecer a flag independente da B, mantendo-a falsa; assim, durante toda esta etapa, a Série B continuará lendo exclusivamente `classificacao:serie_b`, `dados_externos:serie_b` e `resultados:serie_b:*`.
   - Nenhum componente visual será alterado.

4. **Testes mínimos e isolados**
   - Ajustar `src/test/brasileiraoSync.test.ts` para validar registro, chave Shadow e baseline legado da Série B.
   - Adicionar cobertura da Série B em `src/test/serieAConsolidatedQueries.test.tsx` sem mudar as expectativas da Série A: flag B falsa mantém as três leituras legadas; flag B simulada valida a futura chave Shadow.
   - Adicionar teste específico da instância B e da regra de rodada em um novo teste focado, sem alterar os cenários já validados da Série A.
   - Reexecutar toda a suíte, incluindo os testes existentes do `ShadowRepository`, além de typecheck e build.

## Criação controlada do primeiro Shadow

- Após o código estar válido, executar uma única inicialização persistente para `brasileirao_serie_b`, temporada 2026, usando `scope=dados_externos` — nunca `scope=all`.
- Esse escopo mantém o baseline completo das 38 rodadas carregado pelo repositório, recalcula a classificação a partir dos confrontos históricos e permite atualizar somente os dados atuais obtidos pela API; nenhuma rodada futura receberá placar inventado.
- A escrita ficará restrita a `shadow/brasileirao_serie_b/2026` por `persistMode: 'shadow'`.
- Se a validação do payload falhar, nada será persistido. Não haverá escrita nas chaves legadas.

## Auditoria final somente de leitura

Depois da criação, comparar diretamente legado × Shadow e interromper sem correções adicionais:

- R1–R38: quantidade de confrontos, quantidade com placar, conjuntos de times, confrontos e placares; destacar cada divergência.
- Classificação: posição e métricas disponíveis por time; se houver diferença, informar times, campos e causa provável sem corrigir.
- Participantes: total esperado de 20, nomes e IDs Cartola; comparar URLs dos escudos separadamente, sem tratar atualização de URL como erro quando nome/ID coincidirem.
- Confirmar metadados, 38 fases e destino exclusivo da chave Shadow.

## Entrega

Relatório com:

- arquivos alterados;
- estrutura e metadados do Shadow da Série B;
- tabela R1–R38 com confrontos, placares e divergências;
- comparação da classificação e dos 20 participantes/IDs;
- resultados dos testes, typecheck e build;
- confirmações explícitas de que Série A e Série C permaneceram intactas, o frontend B segue no legado, `USE_CONSOLIDATED_SERIE_B` está `false`, nenhum `scope=all` foi usado e nenhum histórico foi sobrescrito por vazio.

## Fora do escopo

Nenhuma ativação do frontend B, migração da Série C, alteração da Série A, mudança no dispatcher genérico, `ShadowRepository`, `roundPreservation.ts`, componentes visuais ou sincronização ampla.
