UPDATE public.sheets_cache
SET data = jsonb_set(
    data,
    '{classificacao,grupos,geral}',
    (
        SELECT jsonb_agg(
            CASE 
                WHEN (elem->>'teamId') = 'Kamellouco FC' THEN
                    elem || '{"goalsFor": 1950.08, "goalsAgainst": 1869.72, "goalDiff": 80.36}'::jsonb
                ELSE elem
            END
        )
        FROM jsonb_array_elements(data->'classificacao'->'grupos'->'geral') AS elem
    )
)
WHERE cache_key = 'shadow/brasileirao_serie_a/2026';

UPDATE public.sheets_cache
SET data = jsonb_set(
    data,
    '{metadata,hash}',
    to_jsonb(md5(random()::text))
)
WHERE cache_key = 'shadow/brasileirao_serie_a/2026';