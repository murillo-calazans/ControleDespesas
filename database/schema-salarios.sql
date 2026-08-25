-- ==========================================================
-- Salário mensal automático
-- ==========================================================
-- Rode DEPOIS de database/schema-fixas-quinto-dia-util.sql já ter
-- sido aplicado (reaproveita a função quinto_dia_util()).
-- supabase db query --linked --project-ref <ref> --file database/schema-salarios.sql
--
-- Um valor de salário por pessoa (usuario_id único) — todo 5º dia útil
-- do mês (mesmo cronograma das despesas fixas), deposita esse valor na
-- carteira dela automaticamente, se ainda não tiver depositado nesse
-- mês. Reaproveita carteira_movimentos (tipo="deposito") em vez de uma
-- tabela de lançamentos separada; salario_id é só o vínculo que marca
-- "esse depósito veio do lançamento automático do salário".

create table if not exists salarios (
    id bigint generated always as identity primary key,
    usuario_id uuid not null unique references usuarios(id) on delete restrict,
    valor numeric(10,2) not null check (valor > 0),
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

alter table carteira_movimentos add column if not exists salario_id bigint
    references salarios(id) on delete set null;

create index if not exists carteira_movimentos_salario_idx
    on carteira_movimentos (salario_id) where salario_id is not null;

-- Trava contra lançar o mesmo salário duas vezes no mesmo mês.
create unique index if not exists carteira_movimentos_salario_unico_por_mes
    on carteira_movimentos (
        salario_id,
        extract(year from (criado_em at time zone 'America/Sao_Paulo')),
        extract(month from (criado_em at time zone 'America/Sao_Paulo'))
    )
    where salario_id is not null;

alter table salarios enable row level security;

create policy "leitura casal" on salarios for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "escrita casal" on salarios for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "atualizacao casal" on salarios for update to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));
create policy "exclusao casal" on salarios for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create or replace function lancar_salarios()
returns void language plpgsql security definer set search_path = public as $$
declare
    hoje date := (now() at time zone 'America/Sao_Paulo')::date;
    sal record;
    v_carteira_id bigint;
begin
    if hoje <> quinto_dia_util(hoje) then
        return;
    end if;

    for sal in select * from salarios where ativo loop
        if not exists (
            select 1 from carteira_movimentos
            where salario_id = sal.id
              and date_trunc('month', (criado_em at time zone 'America/Sao_Paulo')) = date_trunc('month', hoje)
        ) then
            select id into v_carteira_id from carteiras where usuario_id = sal.usuario_id;
            if v_carteira_id is not null then
                insert into carteira_movimentos (carteira_id, tipo, valor, descricao, registrado_por, salario_id)
                values (v_carteira_id, 'deposito', sal.valor, 'Salário', sal.usuario_id, sal.id);
            end if;
        end if;
    end loop;
end;
$$;

select cron.schedule(
    'lancar-salarios-diario',
    '10 3 * * *', -- 03:10 UTC = 00:10 America/Sao_Paulo, mesma janela das despesas fixas
    $$select lancar_salarios();$$
);
