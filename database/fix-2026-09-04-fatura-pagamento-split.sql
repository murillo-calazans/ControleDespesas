-- ==========================================================
-- Correção pontual: faturas pagas em 04/09/2026 debitaram tudo da
-- carteira da Isabela
-- ==========================================================
-- Execução ÚNICA — não rodar de novo. Histórico do bug:
--
-- fatura_pagamentos.id 1 (cartão 1 · Nubank · R$ 2.139,91) e id 2
-- (cartão 2 · Itaú · R$ 516,72) foram inseridas em 2026-09-04
-- 18:13:18 e 18:13:29 UTC. Nesse momento o trigger
-- trg_fatura_pagamentos_saldo ainda era a versão antiga (definida em
-- schema-carteiras-cartoes-fixas.sql), que debita o valor_pago
-- INTEIRO da carteira do DONO do cartão — os dois cartões são da
-- Isabela, então as duas faturas saíram 100% da carteira dela.
--
-- A correção (schema-fatura-pagamento-split.sql, que divide por
-- responsável — "ambos" ao meio) só foi criada e aplicada às
-- 2026-09-04 18:23:48 UTC, ~10min depois — tarde demais pras duas
-- faturas acima, que ficaram com o valor errado gravado direto em
-- carteiras.saldo (não tem log/ledger de saldo pra reverter
-- automaticamente).
--
-- Esse script reverte o débito indevido dessas duas faturas e refaz
-- certo, despesa por despesa, com a mesma regra do trigger já
-- corrigido (ver dry-run que gerou os números abaixo):
--
--   Isabela: foi debitado R$ 2.656,63 (as duas faturas inteiras);
--            devido de fato R$ 1.522,13 → crédito de R$ 1.134,51.
--   Murillo: foi debitado R$ 0,00; devido de fato R$ 1.134,51
--            → débito de R$ 1.134,51.
--
-- (a soma das duas carteiras não muda — é só uma redistribuição)

begin;

with faturas as (
    select fp.id as fatura_id, fp.cartao_id, fp.competencia, fp.valor_pago, fp.data_pagamento,
           c.usuario_id as dono_cartao_id,
           coalesce(c.dia_vencimento, c.dia_fechamento) as dia_corte
    from fatura_pagamentos fp
    join cartoes c on c.id = fp.cartao_id
    where fp.id in (1, 2) -- as duas faturas pagas em 2026-09-04 sob o trigger antigo
),
despesas_fatura as (
    select f.fatura_id, f.dono_cartao_id, d.valor, d.usuario_id, d.compartilhada
    from faturas f
    join despesas d on d.cartao_id = f.cartao_id
        and d.forma_pagamento = 'crédito'
        and d.data_despesa <= f.data_pagamento
        and (
            (date_trunc('month', d.data_despesa) = date_trunc('month', f.competencia)
                and extract(day from d.data_despesa) <= f.dia_corte)
            or
            (date_trunc('month', d.data_despesa) = date_trunc('month', f.competencia) - interval '1 month'
                and extract(day from d.data_despesa) > f.dia_corte)
        )
),
devido_por_pessoa as (
    select u.id as usuario_id,
        sum(case when not df.compartilhada and df.usuario_id = u.id then df.valor else 0 end)
        + sum(case when df.compartilhada then df.valor / 2 else 0 end) as total_devido
    from usuarios u
    cross join despesas_fatura df
    group by u.id
),
debito_indevido as (
    select dono_cartao_id as usuario_id, sum(valor_pago) as valor_debitado_errado
    from faturas
    group by dono_cartao_id
)
update carteiras c
set saldo = c.saldo
    + coalesce((select valor_debitado_errado from debito_indevido di where di.usuario_id = c.usuario_id), 0)  -- desfaz o débito indevido
    - coalesce((select total_devido from devido_por_pessoa dp where dp.usuario_id = c.usuario_id), 0)          -- cobra o que é de fato devido
where c.usuario_id in (
    '6fff5f8a-d2cd-458f-8fc4-4506d4a5a800', -- Isabela
    '974b6fa6-26ba-41b4-acf0-64e3da7d31da'  -- Murillo
);

commit;
