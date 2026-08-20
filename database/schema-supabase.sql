-- ==========================================================
-- Controle de Despesas — Schema Supabase
-- ==========================================================
-- Rode este script inteiro no SQL Editor do painel do Supabase
-- (Editor SQL no menu lateral), num projeto criado na região
-- São Paulo (sa-east-1).
--
-- Sem papéis (admin/leitor) de propósito — os dois usuários têm
-- acesso igual, é orçamento compartilhado do casal, não uma
-- ferramenta de equipe com hierarquia.

create table if not exists usuarios (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    -- Vinculado depois de criar o login em Authentication -> Users
    -- (ver instruções no fim do arquivo). null até isso ser feito.
    auth_user_id uuid unique references auth.users(id) on delete set null,
    criado_em timestamptz not null default now()
);

create table if not exists despesas (
    id bigint generated always as identity primary key,
    usuario_id uuid not null references usuarios(id) on delete restrict,
    valor numeric(10,2) not null check (valor > 0),
    categoria text not null check (categoria in (
        'Alimentação', 'Mercado', 'Transporte', 'Saúde', 'Lazer',
        'Casa', 'Educação', 'Assinaturas', 'Compras', 'Outros'
    )),
    forma_pagamento text not null default 'outro' check (forma_pagamento in (
        'crédito', 'débito', 'pix', 'dinheiro', 'outro'
    )),
    descricao text,
    data_despesa date not null default current_date,
    -- Texto cru digitado pelo usuário — auditoria de quando a IA
    -- interpretar errado (ver supabase/functions/parse-despesa).
    mensagem_original text not null,
    confianca_ia text check (confianca_ia in ('alta', 'media', 'baixa')),
    criado_em timestamptz not null default now()
);

create index if not exists despesas_usuario_idx on despesas (usuario_id);
create index if not exists despesas_data_idx on despesas (data_despesa);

-- ==========================================================
-- Row Level Security
-- ==========================================================

alter table usuarios enable row level security;
alter table despesas enable row level security;

-- Leitura e escrita: qualquer um dos dois usuários (tem uma linha em
-- "usuarios" com auth_user_id = quem está logado) vê e mexe em TUDO —
-- orçamento compartilhado, não dividido por pessoa. Escrita normal
-- (pelo site, texto -> IA) passa pela Edge Function parse-despesa,
-- que usa a service_role (ignora RLS) depois de já ter confirmado
-- que quem chamou é um dos dois — as policies de insert/update/delete
-- aqui embaixo cobrem edição manual feita direto pelo dashboard
-- (corrigir categoria errada, apagar duplicata, etc.).

create policy "leitura casal" on usuarios for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "leitura casal" on despesas for select to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "escrita casal" on despesas for insert to authenticated
    with check (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "atualizacao casal" on despesas for update to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

create policy "exclusao casal" on despesas for delete to authenticated
    using (exists (select 1 from usuarios where auth_user_id = auth.uid()));

-- ==========================================================
-- Depois de rodar este script:
-- 1. Vá em Authentication -> Users -> Add user e crie as DUAS contas
--    (e-mail + senha) — uma pra você, uma pra sua esposa.
-- 2. Copie o UUID de cada usuário (aparece na lista de Users).
-- 3. Rode o comando abaixo, TROCANDO os UUIDs e nomes:
--
--    insert into usuarios (nome, auth_user_id) values
--        ('Murillo', 'COLE-O-UUID-AQUI'),
--        ('Nome da esposa', 'COLE-O-OUTRO-UUID-AQUI');
--
-- ==========================================================
