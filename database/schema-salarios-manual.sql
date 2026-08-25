-- ==========================================================
-- Salário: de automático (cron no 5º dia útil) pra manual
-- ==========================================================
-- Rode DEPOIS de database/schema-salarios.sql já ter sido aplicado.
-- supabase db query --linked --project-ref <ref> --file database/schema-salarios-manual.sql
--
-- Trabalhar com uma data exata ("5º dia útil") não reflete a realidade
-- — o salário pode cair adiantado ou atrasado. Em vez de lançar
-- sozinho nessa data, agora é você quem confirma na hora que o
-- dinheiro cai de verdade (botão "Efetivar" na aba Carteiras).

select cron.unschedule('lancar-salarios-diario');
drop function if exists lancar_salarios();
