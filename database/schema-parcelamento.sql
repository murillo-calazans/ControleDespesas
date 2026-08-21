-- ==========================================================
-- Parcelamento — compras em várias parcelas mensais
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-parcelamento.sql
--
-- Quando a mensagem livre cita algo como "2/5" ou "em 5x", a Edge
-- Function parse-despesa já cria de uma vez todas as parcelas que
-- faltam (uma despesa por mês, mesma parcela_grupo_id), em vez de só
-- gravar o pagamento daquele mês isolado.

alter table despesas add column if not exists parcela_atual smallint;
alter table despesas add column if not exists parcela_total smallint;
-- Agrupa as parcelas da mesma compra (todas geradas de uma vez).
alter table despesas add column if not exists parcela_grupo_id uuid;

alter table despesas drop constraint if exists despesas_parcela_valida;
alter table despesas add constraint despesas_parcela_valida check (
    (parcela_atual is null and parcela_total is null)
    or (parcela_atual is not null and parcela_total is not null
        and parcela_atual between 1 and parcela_total)
);

create index if not exists despesas_parcela_grupo_idx
    on despesas (parcela_grupo_id) where parcela_grupo_id is not null;
