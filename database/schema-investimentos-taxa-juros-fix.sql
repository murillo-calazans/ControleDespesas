-- ==========================================================
-- Corrige NaN na taxa de juros dos investimentos
-- ==========================================================
-- Rode DEPOIS de database/schema-investimentos-taxa-juros.sql.
-- supabase db query --linked --project-ref <ref> --file database/schema-investimentos-taxa-juros-fix.sql
--
-- O tipo "numeric" do Postgres aceita 'NaN' como valor válido, e o
-- check original (so "taxa_juros >= 0") não barra isso — o Postgres
-- trata NaN como maior que qualquer número em comparações, então
-- "NaN >= 0" dá true. Um NaN gravado quebrava a tela (o <input> de
-- taxa não aceita value="NaN") e travava novas tentativas de salvar
-- com 400. Isso já foi corrigido no front (js/ui/investimentos.js e
-- js/services/investimentos.js nunca mais mandam NaN pro banco), mas
-- se algum já tiver sido gravado antes da correção, este script limpa.

update investimentos
set taxa_juros = null, periodo_taxa = null
where taxa_juros::text = 'NaN';

alter table investimentos drop constraint if exists investimentos_taxa_juros_check;
alter table investimentos add constraint investimentos_taxa_juros_check
    check (taxa_juros is null or (taxa_juros >= 0 and taxa_juros::text <> 'NaN'));
