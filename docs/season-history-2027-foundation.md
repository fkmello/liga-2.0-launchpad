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
