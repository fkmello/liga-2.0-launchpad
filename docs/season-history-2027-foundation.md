# Histórico de Temporadas — Fundação para 2027

## Objetivo
Preservar a história da Liga Jacarandás entre temporadas, permitindo consultar campeões, pódios, classificação final completa e pontuação de cada participante, sem depender da disponibilidade futura da API do Cartola.

## Restrição operacional da API
A API do Cartola deve ser considerada indisponível após o encerramento da temporada e até a janela de reabertura do ano seguinte.
1. Toda captura que dependa da API deve ser feita e validada enquanto a temporada 2026 ainda estiver acessível.
2. O arquivo histórico deve ser autossuficiente: a interface de consulta nunca deve chamar a API do Cartola.
3. No hiato, testes devem usar fixtures/cópias de snapshots reais já armazenados, sem chamadas externas.
4. Não assumir que a API manterá dados consultáveis depois da rodada 38.

## Modelo de dados proposto
Criar uma camada própria de arquivo histórico, separada das tabelas operacionais da temporada corrente.

### season_archives
Um registro por liga e temporada: id UUID; league; season; status (draft/archived); archived_at; archived_by; summary JSONB. Restrição única em (league, season).

### season_archive_standings
Snapshot da classificação final: archive_id; position; profile_id opcional; team_name; badge_url; total_points; source_snapshot JSONB. Restrição única em (archive_id, position).

### season_archive_competitions
Um registro por torneio arquivado: archive_id; tournament_slug; tournament_name; champion_name e escudo; runner_up_name e escudo; third_place_name e escudo; final_score JSONB; source_snapshot JSONB com fases/classificação/resultados completos; status (pending/complete/not_played). Restrição única em (archive_id, tournament_slug).

Os snapshots JSONB preservam detalhes da temporada, enquanto os campos normalizados facilitam a Galeria dos Campeões e rankings históricos. A modelagem final deve ser validada contra o formato real de cada competição antes da migration.

## Fluxo administrativo proposto
1. O administrador escolhe a temporada e revisa os dados capturados.
2. O sistema valida se a classificação final e os torneios selecionados têm resultados suficientes.
3. O administrador confirma o arquivamento.
4. O sistema grava snapshots da classificação e das competições.
5. A consulta pública lê exclusivamente as tabelas de arquivo.
6. Correções posteriores devem ser feitas por ação administrativa auditável, não por sincronização automática.
O arquivamento não deve ser executado automaticamente apenas porque a rodada 38 terminou. Deve exigir revisão e confirmação do administrador.

## Plano por janela de disponibilidade
### Enquanto a API 2026 estiver disponível
- Mapear consultas necessárias para fechar a temporada.
- Capturar e validar classificação anual final, turnos e classificações relevantes.
- Capturar fases, resultados, pódios e identificadores/escudos dos torneios.
- Guardar cópias de payloads reais para fixtures de testes.
- Confirmar como os dados externos se relacionam com perfis/participantes da liga.

### Durante o hiato sem API
- Criar migrations, tabelas, índices, RLS e políticas de leitura/admin.
- Implementar o serviço de arquivamento baseado exclusivamente nos snapshots locais.
- Implementar a Galeria dos Campeões e a consulta de classificação completa.
- Testar com fixtures reais de 2026, sem chamadas à API.
- Preparar a nova temporada sem alterar nem sobrescrever o arquivo de 2026.

### Quando a API 2027 reabrir
- Fazer smoke tests de leitura.
- Confirmar compatibilidade do formato e eventuais mudanças da API.
- Validar captura da nova temporada antes de habilitar o fluxo operacional.

## Cuidados de segurança e integridade
- Não sobrescrever cache ou dados de 2026 ao iniciar 2027.
- Não inferir campeões a partir de dados incompletos.
- Tratar empates/decisões manuais como dados explícitos.
- Habilitar RLS em todas as tabelas expostas.
- Leitura do histórico conforme a regra de acesso da liga; escrita/arquivamento somente para administradores.
- Nunca expor service-role no frontend.
- Manter snapshots com origem e timestamp para auditoria.

## Estado inicial
Este documento é a fundação de planejamento. Nenhuma tabela foi criada, nenhum dado foi arquivado e nenhuma sincronização ou deploy foi alterado por esta etapa.

## Auditoria inicial dos dados existentes — 31/10/2026

Esta auditoria foi feita por leitura do código e dos registros atuais de `public.sheets_cache` e `public.tournament_settings`. Ela não executou chamadas à API do Cartola, não alterou o banco e não arquivou dados.

### Torneios configurados atualmente

Os slugs presentes em `src/config/leagueSlugs.ts` e/ou `tournament_settings` mostram que a configuração precisa ser dinâmica. Em 31/10/2026, os registros de configuração são:

- `brasileirao-serie-a`, `brasileirao-serie-b`, `brasileirao-serie-c`: habilitados.
- `copa-do-brasil`, `libertadores`, `sulamericana`: habilitados.
- `champions-league`, `copa-do-mundo`: habilitados e marcados como finalizados.
- `copa-intercontinental`: desabilitado.

A lista acima é apenas um retrato da configuração atual, não uma lista fixa para o modelo histórico. Cada temporada deve registrar somente os torneios que efetivamente existiram/foram disputados nela.

### Fontes e formatos já identificados

- Ranking da liga: `ranking_liga:ANUAL`, `ranking_liga:1º TURNO` e `ranking_liga:2º TURNO` possuem 60 entradas cada no momento da auditoria. Há também caches mensais. Esses dados são atualizáveis e ainda não representam necessariamente a classificação final da temporada.
- Séries A/B/C: existem snapshots `shadow/brasileirao_serie_a/2026`, `shadow/brasileirao_serie_b/2026` e `shadow/brasileirao_serie_c/2026`, cada um com fases por rodada (1 a 38), classificação e dados externos.
- Copa do Brasil: `shadow/copa_brasil/2026`, com fases, classificação e dados externos. O cache estava sincronizado em 20/10/2026; precisa ser atualizado/validado antes de servir como fonte final.
- Libertadores: `shadow/libertadores/2026`, com fase de grupos, mata-mata, classificação e dados externos.
- Sul-Americana: `sulamericana:2026`, com fase de grupos, mata-mata, classificação e dados externos. Também existe cache legado `sulamericana`; a seleção da fonte canônica precisa ser definida para o arquivamento.
- Champions League: cache `campeoes`, com fases, classificação e dados externos.
- Copa do Mundo: cache `copa_mundo`, com fases, classificação e dados externos.
- Intercontinental: cache legado `intercontinental`, com fases; o torneio está desabilitado na configuração atual. É necessário verificar se houve disputa efetiva em 2026 antes de marcar como não disputado ou arquivável.

### Pontos que exigem captura/validação antes do fim da janela da API

1. Guardar snapshots imutáveis do ranking anual e dos dois turnos quando cada período fechar; o cache atual de 60 posições pode ser sobrescrito.
2. Confirmar se os caches de Séries A/B/C incluem classificação final completa e pontos totais, e não apenas resultados por rodada.
3. Verificar para cada torneio se todas as fases, placares, vencedores manuais e pódio estão presentes no snapshot mais recente.
4. Resolver qual cache é a fonte oficial quando existem variantes legadas e versionadas (especialmente Sul-Americana, Libertadores e Copa do Brasil).
5. Preservar identificadores Cartola, nomes e escudos em snapshots; não depender de consultas futuras para reconstruí-los.
6. Definir o vínculo histórico com os participantes: `profiles` representa usuários atuais e pode mudar, enquanto `user_teams` mantém `id_cartola`, nome, série e liga. O arquivo precisa conservar também uma identidade textual estável no próprio snapshot, sem depender exclusivamente de uma FK para perfil.
7. Capturar os resultados da temporada e validar cobertura/consistência usando dados existentes, antes de desenhar a rotina de arquivamento.

### Observações de implementação

- `sheets_cache` usa a coluna `cache_key` e o JSONB `data`; é cache operacional, não arquivo permanente.
- `tournament_settings` registra habilitação e finalização, mas não deve ser a fonte histórica exclusiva: configurações podem mudar entre temporadas.
- `src/hooks/useGoogleSheets.ts` confirma contratos diferentes para ranking, classificação, confrontos, fases de grupos e mata-mata. A camada histórica deve preservar o snapshot bruto original e extrair campos normalizados quando possível.
- Nenhuma migration, tabela, policy RLS, chamada à API ou alteração de produção foi realizada nesta auditoria.


## Regras de escopo confirmadas pelo administrador — 31/10/2026

### Ranking da liga
- O histórico permanente deve guardar a classificação anual completa de todos os participantes, não apenas o top 10.
- Primeiro turno, segundo turno e rankings mensais continuam sendo exibidos durante a temporada corrente para acompanhamento e premiação, mas ficam fora do arquivo histórico permanente por enquanto.
- O número de participantes não deve ser fixado em 60: o arquivo deve aceitar o total de equipes existente em cada temporada.

### Champions League e Copa do Mundo
- A Champions League de 2026 foi um torneio separado, alimentado por API própria e jogadores da competição europeia.
- Para 2027, o administrador considera reaproveitar a estrutura/experiência da Champions, mas como um torneio adicional dentro da liga principal, usando a API do Brasileirão. Isso ainda é uma decisão futura, não deve ser presumido nem habilitado agora.
- O histórico deve permitir que o torneio seja exibido sob o mesmo nome ao longo dos anos, preservando em cada temporada a origem da API e o formato/fonte dos dados. Assim, não se confunde a edição independente de 2026 com uma possível edição integrada a partir de 2027.
- A Copa do Mundo de 2026 foi uma competição separada, com API própria, e tem periodicidade de quatro anos. A continuidade depende de eventual disponibilização futura da API pela Globo. Não criar temporadas futuras fictícias; preservar a edição de 2026 e só adicionar outra quando efetivamente existir.

### Política de catálogo histórico
O catálogo não deve ser uma lista fixa de torneios codificada para sempre. Cada arquivo de temporada registra os torneios efetivamente disputados naquela temporada, com identificador estável, nome apresentado, origem da API, formato e status. Um torneio novo começa seu histórico na primeira temporada em que for disputado; um torneio encerrado mantém os arquivos anteriores.


## Investigação da Sul-Americana: cache legado x cache versionado — 31/10/2026

Inspeção estática do código na branch `main` (sem chamadas à API, sem alterações no banco e sem deploy) esclareceu o fluxo atualmente implementado:

### Quem lê o cache legado `sulamericana`
- `src/hooks/useGoogleSheets.ts`: os quatro hooks usados pela tela — `useConfrontosSulamericanaGrupos`, `useDadosExternosSulamericana`, `useClassificacaoSulamericana` e `useConfrontosSulamericana` — chamam `fetchWithFallback('sulamericana', ...)`.
- `src/components/tournaments/SulamericanaView.tsx`: usa diretamente esses quatro hooks. Portanto, a interface atual da Sul-Americana está ligada ao cache legado.
- `src/lib/sheetsCache.ts`: `fetchWithFallback` consulta primeiro a chave indicada em `sheets_cache`; só chama a Edge Function antiga `google-sheets` se não encontrar cache.
- `supabase/functions/sync-sheets/index.ts`: `syncLibertadoresOrSulamericana(..., 'sulamericana', ...)` grava a chave `sulamericana`, tipo `copa`. Os escopos `smart`, `tournament`, `all` e `sulamericana_dados_externos` desse fluxo também apontam para esse escritor legado.

### O que o fluxo versionado/consolidado faz — e o que não faz
- `supabase/functions/sync-tournament-api/index.ts` resolve torneios exclusivamente pelo registry `supabase/functions/_shared/tournament/registry.ts`.
- O registry atual contém Copa do Brasil, Brasileirão A/B/C, Libertadores e Copa do Mundo; **não contém `sulamericana`**.
- O dispatcher de cron percorre `listTournaments()`; consequentemente, a Sul-Americana não é sincronizada por esse dispatcher/registry.
- O código consolidado da interface (`useTournamentPayload`) só está habilitado para Série A/B/C pelas feature flags; não existe caminho consolidado habilitado para a tela da Sul-Americana.
- A configuração de chaves `src/config/tournamentCacheKeys.ts` não registra uma migração especial da Sul-Americana. A existência do registro `sulamericana:2026` no banco, por si só, não o torna fonte ativa do app.

### Conclusão operacional
O cache `sulamericana` é a fonte ativa da tela e continua sendo atualizado pelo fluxo antigo de sincronização. O cache `sulamericana:2026` é um registro versionado paralelo, mas não foi encontrado consumidor no frontend nem produtor no registry/cron atual. Assim, a hipótese mais provável é que ele tenha sido criado por uma etapa experimental/manual ou por um fluxo anterior não presente na branch inspecionada; a origem exata da gravação ainda não está comprovada.

**Não consolidar nem apagar nenhum dos dois registros neste momento.** Antes de qualquer mudança, é necessário verificar o histórico de criação/atualização do registro versionado (se houver logs/auditoria disponíveis) e confirmar se existe algum consumidor externo ao código rastreado. Para o projeto de histórico, a captura de 2026 deve ler e comparar ambos os snapshots, registrar a origem de cada um e escolher explicitamente o payload completo/validado — sem assumir que a chave versionada é a canônica apenas pelo nome.

A inspeção foi somente leitura. Nenhum cache, código funcional, migration, configuração, sincronização ou deploy foi alterado.


### Comparação direta dos dois registros no Supabase — 31/10/2026

Consulta somente leitura aos dois registros de `public.sheets_cache`:

| Propriedade | `sulamericana` (legado) | `sulamericana:2026` (versionado) |
|---|---|---|
| `type` | `copa` | `sulamericana` |
| Último `synced_at` | 27/10/2026 11:18:40 UTC | 29/10/2026 19:29:41 UTC |
| Versão/metadata | ausentes | `version=1`, metadata com temporada 2026, provider `cartola_brasileirao`, `source_type=api`, schema_version 1 e hash |
| Rodadas de grupos | `grupos.rodada_1..6` | `fases["Fase de Grupos"].rodada_1..6` |
| Classificação | `classificacao.groups` | `classificacao.grupos` |
| Dados externos | 32 linhas | 32 linhas |
| Mata-mata | Oitavas (8), Quartas (4), Semifinal (2), Final (2) | mesmas fases e quantidades |

Comparações estruturais/JSON:
- As seis rodadas de confrontos da fase de grupos são idênticas entre os dois registros.
- Os dados das quatro fases de mata-mata são idênticos.
- Os dados externos **não são idênticos**, apesar de ambos terem 32 linhas. Não se deve substituir um pelo outro sem identificar as diferenças e validar os IDs/escudos.
- A classificação também não é idêntica em representação: o legado usa a chave `groups`, enquanto o versionado usa `grupos`. A comparação direta desses campos retornou diferença; é necessário normalizar os dois formatos e comparar nomes, equipes, posições e estatísticas antes de escolher o snapshot.
- O registro versionado contém a classificação em sete grupos, com quatro linhas cada. O registro legado também possui classificação, mas em estrutura distinta.

### O que se sabe sobre a origem do cache versionado

O registro versionado tem metadados de geração próprios (hash SHA-256, `generated_at`, provider e source_type), foi sincronizado quase 32 horas depois do legado e foi gravado pelo mesmo UUID de administrador indicado em `synced_by`. Isso comprova que ele passou por um fluxo de geração versionado, mas **não identifica por si só qual função/commit originou a gravação**. A inspeção da branch atual não encontrou produtor da Sul-Americana no registry novo. A origem exata permanece não comprovada; não atribuir a criação a um fluxo específico sem logs ou histórico de auditoria.

### Decisão de segurança para o arquivo histórico

Não escolher ainda um cache como substituto integral do outro. Para o snapshot histórico de 2026, o processo deverá:
1. preservar os dois payloads brutos com sua chave, tipo, timestamps e metadados de origem;
2. comparar/normalizar classificação e dados externos, resolvendo divergências de equipes, IDs e escudos;
3. usar os confrontos de grupos e mata-mata, já confirmados idênticos nesta leitura, sem descartar o payload bruto de nenhuma fonte;
4. registrar explicitamente a fonte escolhida para cada conjunto de dados e eventuais correções manuais.

A comparação foi somente leitura. Nenhum cache, tabela, código funcional, migration, sincronização ou deploy foi alterado.
