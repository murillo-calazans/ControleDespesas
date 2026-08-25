-- ==========================================================
-- Despesas fixas: lançamento no 5º dia útil do mês (dia do salário)
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-fixas-quinto-dia-util.sql
--
-- Antes cada despesa fixa guardava seu próprio "dia do mês" pra
-- lançar (coluna dia_lancamento). Trocado por um cronograma único e
-- global pra todo mundo: o 5º dia ÚTIL do mês (seg-sex, sem calendário
-- de feriados), que é o dia em que o salário cai.

-- 5º dia útil (segunda a sexta) do mês de "p_mes".
create or replace function quinto_dia_util(p_mes date)
returns date language sql immutable as $$
    select d::date
    from generate_series(
        date_trunc('month', p_mes)::date,
        (date_trunc('month', p_mes) + interval '1 month' - interval '1 day')::date,
        interval '1 day'
    ) as d
    where extract(isodow from d) between 1 and 5
    order by d
    limit 1 offset 4
$$;

create or replace function lancar_despesas_fixas()
returns void language plpgsql security definer set search_path = public as $$
declare
    hoje date := (now() at time zone 'America/Sao_Paulo')::date;
    fixa record;
begin
    if hoje <> quinto_dia_util(hoje) then
        return;
    end if;

    for fixa in select * from despesas_fixas where ativa loop
        if not exists (
            select 1 from despesas
            where despesa_fixa_id = fixa.id
              and date_trunc('month', data_despesa) = date_trunc('month', hoje)
        ) then
            insert into despesas (
                usuario_id, valor, categoria, forma_pagamento, cartao_id,
                descricao, data_despesa, mensagem_original, confianca_ia, despesa_fixa_id, compartilhada
            ) values (
                fixa.usuario_id, fixa.valor, fixa.categoria, fixa.forma_pagamento, fixa.cartao_id,
                fixa.descricao, hoje, fixa.mensagem_original, 'alta', fixa.id, fixa.compartilhada
            );
        end if;
    end loop;
end;
$$;

alter table despesas_fixas drop column if exists dia_lancamento;
