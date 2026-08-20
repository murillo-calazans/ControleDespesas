# Controle de Despesas

Site pessoal de controle de gastos, pra um casal. Você digita em texto livre
("Gastei 10 reais na padaria no crédito") e uma IA (Groq, grátis) interpreta e
registra automaticamente — sem preencher formulário campo a campo.

Site estático (HTML/CSS/JS puro, sem build) + Supabase (Postgres + Auth + RLS +
Edge Functions). Mesma filosofia de um projeto irmão (COP Analytics): sem
servidor próprio, sem processo rodando 24h.

## Como funciona

```
Você digita "Gastei 10 reais na padaria no crédito" no site
    → Edge Function "parse-despesa" chama a Groq (chave só no servidor)
    → Groq devolve valor/categoria/forma de pagamento em JSON
    → a despesa é gravada no Supabase
    → o site mostra a confirmação e atualiza a lista
```

## Configuração inicial

1. **Criar o projeto no Supabase** (região São Paulo, `sa-east-1`), em
   [supabase.com](https://supabase.com).
2. **Rodar o schema**: cole todo o conteúdo de `database/schema-supabase.sql`
   no SQL Editor do painel e rode.
3. **Criar as duas contas de login**: Authentication → Users → Add user (uma
   pra você, uma pra sua esposa). Copie o UUID de cada uma.
4. **Vincular as contas**: no SQL Editor, rode (trocando os UUIDs e nomes):
   ```sql
   insert into usuarios (nome, auth_user_id) values
       ('Murillo', 'COLE-O-UUID-AQUI'),
       ('Nome da esposa', 'COLE-O-OUTRO-UUID-AQUI');
   ```
5. **Publicar a Edge Function**: Edge Functions → New function → nome
   `parse-despesa` → cole o conteúdo de
   `supabase/functions/parse-despesa/index.ts` → Deploy.
6. **Configurar a chave da IA**: gere uma chave grátis em
   [console.groq.com/keys](https://console.groq.com/keys). Em Edge Functions →
   Manage secrets, adicione `GROQ_API_KEY` com essa chave.
7. **Configurar o site**: edite `js/config/supabase.js` e troque
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` pelos valores do seu projeto (Project
   Settings → Data API no painel).

## Rodando localmente

Não precisa de servidor nem instalar nada — é só abrir `index.html` direto no
navegador, ou (recomendado, evita alguns bloqueios de navegador com
`file://`) servir a pasta com qualquer servidor estático simples, por exemplo:

```
npx serve .
```

## Publicando

Suba a pasta pra um repositório novo no GitHub e ative o GitHub Pages
(Settings → Pages → Deploy from branch) — mesmo fluxo gratuito usado no
projeto irmão.

## Sobre o WhatsApp

A ideia original era registrar o gasto mandando mensagem no WhatsApp — foi
adiada por enquanto (exigiria um número de WhatsApp dedicado + um processo
rodando 24h num servidor). O texto livre com IA já funciona igual, só que
digitado direto no site. Se um dia isso for retomado, um bot (`whatsapp-web.js`
rodando num servidor pequeno) chamaria essa mesma Edge Function — nada do que
existe hoje precisa ser refeito.
