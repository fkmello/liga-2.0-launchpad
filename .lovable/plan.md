# Corrigir o nome "Guerreiro da Villa" para "Guiguiba 06" (ID 25248276)

## Diagnóstico confirmado

- A aba **DADOS EXTERNOS** da Série C já está correta: `Guiguiba 06` · ID `25248276` · escudo `.../cartola_svg_162/escudo/55/41/32/00a5c7a202-...`.
- A aba **CLASSIFICAÇÃO** da Série C ainda traz o nome antigo `Guerreiro da  Villa` (com espaço duplo). Esse é o texto que o app exibe.
- Como o escudo é casado **por nome**, o nome antigo não encontra correspondência em DADOS EXTERNOS e a linha aparece sem escudo.
- O nome antigo também está cacheado em: `classificacao:serie_c`, `copa:brasil`, `ranking_liga:2º TURNO`, `ranking_liga:ANUAL`, `ranking_liga:SETEMBRO`.

## O que será feito

1. **Correção imediata dos dados**: substituir todas as ocorrências de `Guerreiro da  Villa` / `Guerreiro da Villa` por `Guiguiba 06` nas 5 chaves de cache acima (apenas o nome; placares, pontos e posições ficam intactos).
2. **Blindagem contra recorrência**: normalizar nomes no app por meio dos dados de DADOS EXTERNOS, que são a fonte do ID e do escudo:
   - criar um mapa de apelidos/nomes antigos → nome oficial, alimentado pelo ID Cartola;
   - aplicar esse mapa antes de renderizar a classificação, de modo que qualquer nome divergente vindo da planilha exiba o nome oficial e puxe o escudo correto pelo ID `25248276`.
3. Nada de alteração em regras de pontuação, sincronização, cron ou outros torneios.

## Importante do seu lado

A próxima sincronização reescreve o cache a partir da planilha. Se a aba **CLASSIFICAÇÃO** da Série C (e as abas de RANKING/COPA DO BRASIL onde o nome antigo aparece) continuar com "Guerreiro da Villa", o dado bruto volta ao antigo — mas o passo 2 garante que a tela continue mostrando "Guiguiba 06" com o escudo certo.

## Detalhes técnicos

- Passo 1 via `UPDATE` em `sheets_cache` (replace textual no `data` jsonb das 5 chaves).
- Passo 2 em `src/components/tournaments/ClassificacaoTable.tsx`: hoje `badgeUrls` é construído a partir de `dadosExternos.rows` casando por nome. Passa a construir também um `canonicalNames` (nome antigo → nome oficial) e resolver o nome de cada linha antes de repassar a `StandingsTable` / `LegacyClassificacaoTable`, mantendo o casamento de escudo por nome oficial.
- Alias inicial registrado: `guerreiro da villa` → `Guiguiba 06` (ID 25248276), com comparação sem acentos, sem espaços duplicados e case-insensitive.
