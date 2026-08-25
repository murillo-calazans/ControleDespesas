-- ==========================================================
-- Pular uma despesa fixa num mês específico (imprevisto)
-- ==========================================================
-- Rode DEPOIS de database/schema-fixas-quinto-dia-util.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-despesas-fixas-puladas.sql
--
-- Antes, a única forma de não lançar uma despesa fixa era desativá-la
-- (pausar pra sempre) na aba Fixas. Isso permite pular só UM mês
-- específico (ex.: "esse mês não vou pagar a academia") sem afetar os
-- meses seguintes — o molde continua ativo e volta a lançar/aparecer
-- como "prevista" normalmente no mês seguinte.

create table if not exists despesas_fixas_puladas (
    id bigint generated always as identity primary key,
    despesa_fixa_id bigint not null references despesas_fixas(id) on delete cascade,
    mes date not null,
    criado_em timestamptz not null default now(),
    unique (despesa_fixa_id, mes)
);

alter table despesas_fixas_puladas enable row level security;

create policy "leitura casal" on despesas_fixas_puladas for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on despesas_fixas_puladas for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on despesas_fixas_puladas for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

-- Cron passa a respeitar o pulo: não lança se o mês corrente estiver
-- marcado como pulado pra essa despesa fixa.
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
        ) and not exists (
            select 1 from despesas_fixas_puladas
            where despesa_fixa_id = fixa.id
              and date_trunc('month', mes) = date_trunc('month', hoje)
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
