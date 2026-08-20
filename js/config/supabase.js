/**
 * ==========================================================
 * Configuração do Supabase
 * ==========================================================
 * URL do projeto + "anon key" pública (não é segredo — a segurança
 * vem da RLS no banco, não de esconder essa chave). Troque os dois
 * valores abaixo pelos do SEU projeto (Project Settings -> Data API
 * no painel do Supabase) depois de rodar database/schema-supabase.sql.
 */

const SUPABASE_URL = "https://phdufmylxnjgdrdqeyel.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PZe4jt2FZc39dwLNoi_F_A_vfd956Q4";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
