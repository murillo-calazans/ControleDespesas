-- ==========================================================
-- Fatura paga: debita a carteira de cada um, não só a do dono do cartão
-- ==========================================================
-- Rode DEPOIS de database/schema-despesas-compartilhadas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-fatura-pagamento-split.sql
--
-- Antes, marcar uma fatura como paga debitava o valor inteiro só da
-- carteira do DONO do cartão (usuario_id em "cartoes") — mesmo quando
-- parte da fatura era de despesas do outro ou "compartilhada" (ambos).
-- Agora o trigger reprocessa despesa por despesa dessa fatura (mesma
-- janela de competência usada em js/ui/cartoes.js —
-- competenciaFatura/diaCorteFatura: até o dia de vencimento, se
-- cadastrado, senão o fechamento) e debita a carteira de quem gastou
-- de fato — metade de cada carteira quando compartilhada, igual já
-- acontece pra despesas fora do crédito (ver trg_despesas_saldo em
-- schema-despesas-compartilhadas.sql).

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

    select coalesce(dia_vencimento, dia_fechamento) into v_dia_corte
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
