-- ==========================================================
-- Novas categorias: Filho, Pessoal, Presentes, Lanche
-- ==========================================================
-- Rode DEPOIS de database/schema-supabase.sql e
-- database/schema-carteiras-cartoes-fixas.sql já terem sido aplicados.
-- supabase db query --linked --project-ref <ref> --file database/schema-categorias-extra.sql

alter table despesas drop constraint if exists despesas_categoria_check;
alter table despesas add constraint despesas_categoria_check check (categoria in (
    'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Lazer',
    'Casa', 'Educação', 'Assinaturas', 'Compras',
    'Filho', 'Pessoal', 'Presentes', 'Lanche', 'Outros'
));

alter table despesas_fixas drop constraint if exists despesas_fixas_categoria_check;
alter table despesas_fixas add constraint despesas_fixas_categoria_check check (categoria in (
    'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Lazer',
    'Casa', 'Educação', 'Assinaturas', 'Compras',
    'Filho', 'Pessoal', 'Presentes', 'Lanche', 'Outros'
));
