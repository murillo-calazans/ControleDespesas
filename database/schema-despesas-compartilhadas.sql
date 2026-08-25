-- ==========================================================
-- Despesas compartilhadas ("Ambos")
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-despesas-compartilhadas.sql
--
-- Antes, "Ambos" gravava DUAS linhas (uma por pessoa, valor dividido
-- ao meio) — o que inflava a lista de despesas e, se a tabela
-- "usuarios" tivesse mais de duas linhas (ex.: cadastro de teste),
-- dividia o valor por mais gente do que devia.
--
-- Agora uma despesa compartilhada é UMA linha só, com o valor CHEIO
-- e compartilhada=true. usuario_id vira só "quem registrou" (pra
-- manter a coluna not null); o rateio de fato acontece em dois
-- lugares:
-- 1. Saldo da carteira (trigger abaixo): debita metade de CADA
--    carteira do casal em vez do valor cheio só da carteira de
--    usuario_id.
-- 2. Relatório (js/ui/dashboard.js): ao filtrar por uma pessoa
--    específica, despesas compartilhadas entram na lista dela só
--    pela metade do valor.

alter table despesas add column if not exists compartilhada boolean not null default false;
alter table despesas_fixas add column if not exists compartilhada boolean not null default false;

-- Substitui o trigger de saldo de despesas: quando compartilhada,
-- debita metade de cada carteira do casal (a de usuario_id e a do
-- outro usuário cadastrado) em vez do valor cheio só da carteira de
-- usuario_id.
create or replace function trg_despesas_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_outro_id uuid;
begin
    if TG_OP = 'INSERT' then
        if NEW.forma_pagamento <> 'crédito' then
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
        if OLD.forma_pagamento <> 'crédito' then
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
        if OLD.forma_pagamento <> 'crédito' then
            if OLD.compartilhada then
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor / 2);
                select id into v_outro_id from usuarios where id <> OLD.usuario_id limit 1;
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_outro_id), OLD.valor / 2);
            else
                perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
            end if;
        end if;
        if NEW.forma_pagamento <> 'crédito' then
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

-- Substitui o lançamento automático de despesas fixas pra carregar
-- "compartilhada" do template pra despesa gerada todo mês.
create or replace function lancar_despesas_fixas()
returns void language plpgsql security definer set search_path = public as $$
declare
    hoje date := (now() at time zone 'America/Sao_Paulo')::date;
    dia_hoje int := extract(day from hoje)::int;
    ultimo_dia_mes int := extract(day from (date_trunc('month', hoje) + interval '1 month' - interval '1 day'))::int;
    fixa record;
begin
    for fixa in
        select * from despesas_fixas
        where ativa
          and (dia_lancamento = dia_hoje or (dia_lancamento > ultimo_dia_mes and dia_hoje = ultimo_dia_mes))
    loop
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
