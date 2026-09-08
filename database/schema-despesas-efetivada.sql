-- ==========================================================
-- Despesas previstas (data futura) só debitam quando a data chega
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-despesas-efetivada.sql
--
-- Antes, débito/PIX/dinheiro/saque debitavam a carteira na hora do
-- lançamento, mesmo que a data da despesa fosse no futuro — quem
-- lança uma "previsão de gasto" pro mês que vem via o campo de data
-- editável via um saldo negativo até o dia chegar (ou até alguém
-- compensar manualmente). Crédito já não tinha esse problema (só
-- debita quando a fatura é paga).
--
-- Agora despesas não-crédito também respeitam a data: se "efetivada"
-- é falso, não debita ainda. Um cron diário efetiva (e debita) sozinho
-- assim que data_despesa chega. Editar a data de uma despesa já
-- lançada recalcula "efetivada" na hora — mover pro futuro credita de
-- volta automaticamente; trazer de volta pro passado/hoje debita nas
-- hora, sem precisar de ajuste manual.

alter table despesas add column if not exists efetivada boolean not null default true;

-- Trigger de saldo: só debita/estorna quando efetivada=true. Crédito
-- continua igual (nunca debita aqui, só quando a fatura é paga).
create or replace function trg_despesas_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_outro_id uuid;
begin
    if TG_OP = 'INSERT' then
        if NEW.forma_pagamento <> 'crédito' and NEW.efetivada then
            if NEW.compartilhada then
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor / 2);
                select id into v_outro_id from usuarios where id <> NEW.usuario_id limit 1;
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), -NEW.valor / 2);
            else
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
            end if;
        end if;
        return NEW;
    elsif TG_OP = 'DELETE' then
        if OLD.forma_pagamento <> 'crédito' and OLD.efetivada then
            if OLD.compartilhada then
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor / 2);
                select id into v_outro_id from usuarios where id <> OLD.usuario_id limit 1;
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), OLD.valor / 2);
            else
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
            end if;
        end if;
        return OLD;
    elsif TG_OP = 'UPDATE' then
        if OLD.forma_pagamento <> 'crédito' and OLD.efetivada then
            if OLD.compartilhada then
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor / 2);
                select id into v_outro_id from usuarios where id <> OLD.usuario_id limit 1;
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), OLD.valor / 2);
            else
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
            end if;
        end if;
        if NEW.forma_pagamento <> 'crédito' and NEW.efetivada then
            if NEW.compartilhada then
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor / 2);
                select id into v_outro_id from usuarios where id <> NEW.usuario_id limit 1;
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), -NEW.valor / 2);
            else
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
            end if;
        end if;
        return NEW;
    end if;
    return null;
end;
$$;

-- Cron diário: efetiva (e debita) qualquer despesa cuja data já chegou.
create or replace function efetivar_despesas_vencidas()
returns void language plpgsql security definer set search_path = public as $$
begin
    update despesas
    set efetivada = true
    where efetivada = false
      and data_despesa <= (now() at time zone 'America/Sao_Paulo')::date;
end;
$$;

select cron.schedule(
    'efetivar-despesas-diario',
    '20 3 * * *', -- 03:20 UTC = 00:20 America/Sao_Paulo, depois dos outros crons diários
    $$select efetivar_despesas_vencidas();$$
);
