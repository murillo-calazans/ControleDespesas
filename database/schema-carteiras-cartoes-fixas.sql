-- ==========================================================
-- Controle de Despesas — Carteiras, Cartões, Despesas Fixas, Investimentos
-- ==========================================================
-- Rode DEPOIS de database/schema-supabase.sql já ter sido aplicado.
-- supabase db query --linked --file database/schema-carteiras-cartoes-fixas.sql

-- ----------------------------------------------------------
-- 1. carteiras (saldo real, 1:1 com usuarios)
-- ----------------------------------------------------------
create table if not exists carteiras (
    id bigint generated always as identity primary key,
    usuario_id uuid not null unique references usuarios(id) on delete restrict,
    -- Só os triggers SECURITY DEFINER abaixo escrevem aqui — não há
    -- policy de insert/update pra "authenticated" nesta tabela.
    saldo numeric(10,2) not null default 0,
    criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------
-- 2. cartoes (crédito, ciclo de fechamento real)
-- ----------------------------------------------------------
create table if not exists cartoes (
    id bigint generated always as identity primary key,
    usuario_id uuid not null references usuarios(id) on delete restrict, -- dono/quem paga a fatura
    nome text not null,
    dia_fechamento smallint not null check (dia_fechamento between 1 and 31),
    dia_vencimento smallint check (dia_vencimento between 1 and 31),
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

create unique index if not exists cartoes_usuario_nome_unq
    on cartoes (usuario_id, lower(nome));

-- ----------------------------------------------------------
-- 3. despesas: novo cartao_id (nullable)
-- ----------------------------------------------------------
alter table despesas add column if not exists cartao_id bigint
    references cartoes(id) on delete set null;

create index if not exists despesas_cartao_idx
    on despesas (cartao_id) where cartao_id is not null;

-- ----------------------------------------------------------
-- 4. despesas_fixas (template recorrente)
-- ----------------------------------------------------------
create table if not exists despesas_fixas (
    id bigint generated always as identity primary key,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    valor numeric(10,2) not null check (valor > 0),
    -- MESMA lista de database/schema-supabase.sql e do Edge Function.
    categoria text not null check (categoria in (
        'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Lazer',
        'Casa', 'Educação', 'Assinaturas', 'Compras', 'Outros'
    )),
    forma_pagamento text not null default 'outro' check (forma_pagamento in (
        'crédito', 'débito', 'pix', 'dinheiro', 'outro'
    )),
    cartao_id bigint references cartoes(id) on delete set null,
    descricao text,
    -- Dia do mês em que lança automaticamente. Se o mês não tiver esse
    -- dia (ex.: 31 em fevereiro), lança no último dia daquele mês.
    dia_lancamento smallint not null check (dia_lancamento between 1 and 31),
    ativa boolean not null default true,
    mensagem_original text not null,
    criado_em timestamptz not null default now()
);

create index if not exists despesas_fixas_usuario_idx on despesas_fixas (usuario_id);

-- ----------------------------------------------------------
-- 5. despesas: novo despesa_fixa_id (marca lançamento automático)
-- ----------------------------------------------------------
alter table despesas add column if not exists despesa_fixa_id bigint
    references despesas_fixas(id) on delete set null;

-- Trava contra lançar a mesma fixa duas vezes no mesmo mês.
create unique index if not exists despesas_fixa_unica_por_mes
    on despesas (
        despesa_fixa_id,
        extract(year from data_despesa),
        extract(month from data_despesa)
    )
    where despesa_fixa_id is not null;

-- ----------------------------------------------------------
-- 6. carteira_movimentos (depósito/retirada manual, NÃO passa pela IA)
-- ----------------------------------------------------------
create table if not exists carteira_movimentos (
    id bigint generated always as identity primary key,
    carteira_id bigint not null references carteiras(id) on delete restrict,
    tipo text not null check (tipo in ('deposito', 'retirada', 'ajuste')),
    valor numeric(10,2) not null check (valor <> 0), -- ajuste pode ser negativo
    descricao text,
    registrado_por uuid not null references usuarios(id) on delete restrict,
    criado_em timestamptz not null default now()
);

create index if not exists carteira_movimentos_carteira_idx on carteira_movimentos (carteira_id);

-- ----------------------------------------------------------
-- 7. investimentos (mesma caixa de texto livre das despesas)
-- ----------------------------------------------------------
create table if not exists investimentos (
    id bigint generated always as identity primary key,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    valor numeric(10,2) not null check (valor > 0),
    conta text, -- corretora/conta livre (ex. "XP", "Nubank") — sem lista fixa
    descricao text,
    data_investimento date not null default current_date,
    mensagem_original text not null,
    confianca_ia text check (confianca_ia in ('alta', 'media', 'baixa')),
    criado_em timestamptz not null default now()
);

create index if not exists investimentos_usuario_idx on investimentos (usuario_id);

-- ----------------------------------------------------------
-- 8. fatura_pagamentos (marca fatura como paga → debita a carteira do dono)
-- ----------------------------------------------------------
create table if not exists fatura_pagamentos (
    id bigint generated always as identity primary key,
    cartao_id bigint not null references cartoes(id) on delete restrict,
    competencia date not null, -- primeiro dia do mês em que a fatura fecha, ex. '2026-08-01'
    valor_pago numeric(10,2) not null check (valor_pago > 0),
    data_pagamento date not null default current_date,
    criado_em timestamptz not null default now(),
    unique (cartao_id, competencia)
);

create index if not exists fatura_pagamentos_cartao_idx on fatura_pagamentos (cartao_id);

-- ==========================================================
-- Row Level Security — mesmo padrão "casal" das tabelas existentes.
-- NENHUMA destas policies faz sub-select na própria tabela onde estão
-- (só a policy de select em "usuarios", que já usa `using (true)` —
-- ver comentário no schema original — é a exceção, não mexer nela).
-- ==========================================================

alter table carteiras enable row level security;
alter table cartoes enable row level security;
alter table despesas_fixas enable row level security;
alter table carteira_movimentos enable row level security;
alter table investimentos enable row level security;
alter table fatura_pagamentos enable row level security;

-- carteiras: só leitura — saldo só muda pelos triggers.
create policy "leitura casal" on carteiras for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on cartoes for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on cartoes for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "atualizacao casal" on cartoes for update to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on cartoes for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on despesas_fixas for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on despesas_fixas for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "atualizacao casal" on despesas_fixas for update to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on despesas_fixas for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on carteira_movimentos for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on carteira_movimentos for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on carteira_movimentos for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on investimentos for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on investimentos for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "atualizacao casal" on investimentos for update to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on investimentos for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on fatura_pagamentos for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on fatura_pagamentos for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on fatura_pagamentos for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

-- ==========================================================
-- Triggers de saldo — SECURITY DEFINER pra escrever em carteiras
-- mesmo sem policy de update pra "authenticated" lá.
-- ==========================================================

create or replace function ajustar_saldo_carteira(p_carteira_id bigint, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
    if p_carteira_id is null then return; end if;
    update carteiras set saldo = saldo + p_delta where id = p_carteira_id;
end;
$$;

-- despesas: débito imediato SÓ se não for crédito (crédito só debita
-- quando a fatura é paga, ver trg_fatura_pagamentos_saldo).
create or replace function trg_despesas_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if TG_OP = 'INSERT' then
        if NEW.forma_pagamento <> 'crédito' then
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
        end if;
        return NEW;
    elsif TG_OP = 'DELETE' then
        if OLD.forma_pagamento <> 'crédito' then
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
        end if;
        return OLD;
    elsif TG_OP = 'UPDATE' then
        if OLD.forma_pagamento <> 'crédito' then
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
        end if;
        if NEW.forma_pagamento <> 'crédito' then
            perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
        end if;
        return NEW;
    end if;
    return null;
end;
$$;

create trigger despesas_saldo_trigger
    after insert or update or delete on despesas
    for each row execute function trg_despesas_saldo();

-- investimentos: sempre debita (dinheiro sai da carteira pro investimento)
create or replace function trg_investimentos_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if TG_OP = 'INSERT' then
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
        return NEW;
    elsif TG_OP = 'DELETE' then
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
        return OLD;
    elsif TG_OP = 'UPDATE' then
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = OLD.usuario_id), OLD.valor);
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = NEW.usuario_id), -NEW.valor);
        return NEW;
    end if;
    return null;
end;
$$;

create trigger investimentos_saldo_trigger
    after insert or update or delete on investimentos
    for each row execute function trg_investimentos_saldo();

-- carteira_movimentos: deposito/ajuste soma, retirada subtrai
create or replace function trg_movimentos_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta numeric;
begin
    if TG_OP = 'INSERT' then
        delta := case when NEW.tipo = 'retirada' then -NEW.valor else NEW.valor end;
        perform ajustar_saldo_carteira(NEW.carteira_id, delta);
        return NEW;
    elsif TG_OP = 'DELETE' then
        delta := case when OLD.tipo = 'retirada' then -OLD.valor else OLD.valor end;
        perform ajustar_saldo_carteira(OLD.carteira_id, -delta);
        return OLD;
    end if;
    return null;
end;
$$;

create trigger movimentos_saldo_trigger
    after insert or delete on carteira_movimentos
    for each row execute function trg_movimentos_saldo();

-- fatura_pagamentos: debita a carteira do DONO do cartão
create or replace function trg_fatura_pagamentos_saldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_usuario_id uuid;
begin
    if TG_OP = 'INSERT' then
        select usuario_id into v_usuario_id from cartoes where id = NEW.cartao_id;
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_usuario_id), -NEW.valor_pago);
        return NEW;
    elsif TG_OP = 'DELETE' then
        select usuario_id into v_usuario_id from cartoes where id = OLD.cartao_id;
        perform ajustar_saldo_carteira((select id from carteiras where usuario_id = v_usuario_id), OLD.valor_pago);
        return OLD;
    end if;
    return null;
end;
$$;

create trigger fatura_pagamentos_saldo_trigger
    after insert or delete on fatura_pagamentos
    for each row execute function trg_fatura_pagamentos_saldo();

-- ==========================================================
-- pg_cron: lança despesas_fixas automaticamente, uma vez por dia
-- ==========================================================
-- Se `create extension` falhar por permissão, habilitar em
-- Dashboard -> Database -> Extensions -> pg_cron antes de rodar de novo.
create extension if not exists pg_cron;

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
                descricao, data_despesa, mensagem_original, confianca_ia, despesa_fixa_id
            ) values (
                fixa.usuario_id, fixa.valor, fixa.categoria, fixa.forma_pagamento, fixa.cartao_id,
                fixa.descricao, hoje, fixa.mensagem_original, 'alta', fixa.id
            );
        end if;
    end loop;
end;
$$;

select cron.schedule(
    'lancar-despesas-fixas-diario',
    '10 3 * * *', -- 03:10 UTC = 00:10 America/Sao_Paulo
    $$select lancar_despesas_fixas();$$
);

-- ==========================================================
-- Seed: uma carteira pra cada usuário já cadastrado.
-- ==========================================================
insert into carteiras (usuario_id, saldo)
select id, 0 from usuarios
on conflict (usuario_id) do nothing;
