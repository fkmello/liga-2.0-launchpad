# Trocar o ID do time "luciluci fc" para 28826806

O ID antigo `3468578` está gravado em vários lugares. Enquanto ele não for trocado em todos, a pontuação parcial (que é buscada na API do Cartola pelo ID) continua vindo do time errado.

## Onde o ID antigo aparece hoje

Verificado no banco:

- `user_teams`: 3 linhas do usuário (ligas `brasileirao`, `campeoes`, `copa_mundo`)
- Cache de dados externos (`sheets_cache`): `campeoes`, `copa_mundo`, `copa:brasil`, `sulamericana`, `dados_externos:serie_b`, `dados_externos:liga_classica`

## O que será feito

1. Substituir `3468578` por `28826806` nas 3 linhas de `user_teams` do time luciluci fc.
2. Substituir o ID em todas as chaves de `sheets_cache` acima (dentro de `dados_externos`/`rows`, tanto no formato de lista quanto no formato de objeto `id_cartola`), atualizando `synced_at`.
3. Não mexer em placares nem em classificação — apenas o identificador.

## Importante (do seu lado)

O cache é reescrito a partir das planilhas na próxima sincronização. Para a correção não voltar atrás, o ID precisa ser trocado também na aba **DADOS EXTERNOS** de cada planilha (Liga Clássica, Série B, Campeões, Copa do Brasil, Sul-Americana, Copa do Mundo). Se preferir, posso apenas aguardar você atualizar as planilhas e sincronizar — mas aí a parcial só corrige após a sincronização.

## Detalhes técnicos

- Atualização via SQL (`jsonb` replace por texto no campo `data` das chaves afetadas, preservando o restante do payload).
- Escudos: as URLs atuais continuam válidas; a próxima sincronização busca o escudo novo pela API usando o ID atualizado.
