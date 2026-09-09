-- ==========================================================
-- Taxa de juros/rendimento configurável por investimento
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-investimentos-taxa-juros.sql
--
-- taxa_juros: percentual (ex.: 0.8 = 0,8%), não fração — sempre
-- relativo ao período em periodo_taxa. Os dois ficam nulos até o
-- usuário configurar manualmente na aba Investimentos; sem taxa
-- configurada, o rendimento estimado simplesmente não aparece.

alter table investimentos add column if not exists taxa_juros numeric(6,3) check (taxa_juros is null or taxa_juros >= 0);
alter table investimentos add column if not exists periodo_taxa text check (periodo_taxa is null or periodo_taxa in ('mensal', 'anual'));

-- Uma taxa sem período (ou vice-versa) não tem como ser usada em
-- nenhum cálculo — força os dois virem juntos ou nenhum dos dois.
alter table investimentos drop constraint if exists investimentos_taxa_periodo_junto_check;
alter table investimentos add constraint investimentos_taxa_periodo_junto_check
    check ((taxa_juros is null) = (periodo_taxa is null));
