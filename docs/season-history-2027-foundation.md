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