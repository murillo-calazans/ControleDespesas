-- ==========================================================
-- Forma de pagamento "Saque"
-- ==========================================================
-- Rode DEPOIS de database/schema-carteiras-cartoes-fixas.sql já ter
-- sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-forma-pagamento-saque.sql
--
-- O relatório passou a unificar "forma de pagamento" e "cartão" num
-- seletor só (ex.: "Nubank - Crédito"), e ganhou a opção "Saque" nessa
-- lista — adiciona esse valor nas duas tabelas que guardam forma de
-- pagamento.

alter table despesas drop constraint if exists despesas_forma_pagamento_check;
alter table despesas add constraint despesas_forma_pagamento_check check (forma_pagamento in (
    'crédito', 'débito', 'pix', 'dinheiro', 'saque', 'outro'
));

alter table despesas_fixas drop constraint if exists despesas_fixas_forma_pagamento_check;
alter table despesas_fixas add constraint despesas_fixas_forma_pagamento_check check (forma_pagamento in (
    'crédito', 'débito', 'pix', 'dinheiro', 'saque', 'outro'
));
