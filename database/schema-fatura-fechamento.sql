-- ==========================================================
-- Fatura é definida pelo fechamento, não pelo vencimento
-- ==========================================================
-- Rode DEPOIS de database/schema-fatura-pagamento-split.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-fatura-fechamento.sql
--
-- trg_fatura_pagamentos_saldo() (schema-fatura-pagamento-split.sql)
-- usava coalesce(dia_vencimento, dia_fechamento) pra decidir a janela
-- de despesas de uma competência — mesma regra que estava em
-- diaCorteFatura (js/ui/cartoes.js). Isso misturava dois conceitos:
-- o vencimento é só quando a fatura vence pra pagamento, não em qual
-- fatura a despesa cai. Agora o trigger usa sempre dia_fechamento,
-- igual ao diaCorteFatura já corrigido no front. Recria a função pra
-- já valer nos próximos pagamentos/estornos de fatura.

create or replace function trg_fatura_pagamentos_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_sinal int;
    v_competencia date;
    v_cartao_id bigint;
    v_dia_corte smallint;
    v_outro_id uuid;
    d record;
begin
    if TG_OP = 'INSERT' then
        v_sinal := -1; -- paga: sai da carteira
        v_competencia := NEW.competencia;
        v_cartao_id := NEW.cartao_id;
    elsif TG_OP = 'DELETE' then
        v_sinal := 1; -- desfez o pagamento: volta pra carteira
        v_competencia := OLD.competencia;
        v_cartao_id := OLD.cartao_id;
    else
        return null;
    end if;

    select dia_fechamento into v_dia_corte
    from cartoes where id = v_cartao_id;

    for d in
        select valor, usuario_id, compartilhada
        from despesas
        where cartao_id = v_cartao_id
          and forma_pagamento = 'crédito'
          and (
              (date_trunc('month', data_despesa) = date_trunc('month', v_competencia)
                  and extract(day from data_despesa) <= v_dia_corte)
              or
              (date_trunc('month', data_despesa) = date_trunc('month', v_competencia) - interval '1 month'
                  and extract(day from data_despesa) > v_dia_corte)
          )
    loop
        if d.compartilhada then
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = d.usuario_id), v_sinal * d.valor / 2);
            select id into v_outro_id from usuarios where id <> d.usuario_id limit 1;
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), v_sinal * d.valor / 2);
        else
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = d.usuario_id), v_sinal * d.valor);
        end if;
    end loop;

    if TG_OP = 'INSERT' then
        return NEW;
    else
        return OLD;
    end if;
end;
$$;
