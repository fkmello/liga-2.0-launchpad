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

- Após o código estar válido, executar primeiro uma simulação sem gravação para `brasileirao_serie_b`, temporada 2026, usando `scope=dados_externos` — nunca `scope=all`.
- Neste código, `scope=dados_externos` não limita o baseline: o `ShadowRepository.load()` carrega classificação, participantes e R1–R38 do legado. Como o escopo não é `rodada`, o adapter também normaliza todos os confrontos carregados para recalcular a classificação.
- O adapter ainda consulta o status do mercado. No estado observado (mercado aberto na R29), a rodada-alvo é R28. A inicialização prevê 41 requisições Cartola em três etapas: 1 status, 20 cadastros/escudos e 20 pontuações da R28.
- Uma pontuação válida da API pode substituir o valor legado da R28; retorno ausente preserva o valor anterior. Antes de persistir, comparar os 10 placares simulados da R28 com o legado.
- Persistir uma única vez somente se R1–R38 mantiverem confrontos e placares históricos, inclusive R28 sem divergência. Se qualquer placar mudar, parar e relatar sem criar o Shadow.
- O Shadow aprovado conterá 38 fases, classificação consolidada recalculada, 20 participantes/dados externos e metadados do provider. R29–R38 permanecerão sem placares.
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
