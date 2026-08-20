// ==========================================================
// Edge Function: parse-despesa
// ==========================================================
// Recebe um texto livre (ex.: "Gastei 10 reais na padaria no
// crédito"), usa a API da Groq (gratuita, sem cartão) pra extrair
// valor/categoria/forma de pagamento/data em JSON estruturado, e já
// grava a despesa. A chave da API fica só aqui (variável de ambiente
// da function) — nunca chega no navegador.
//
// Segurança em duas camadas:
// 1. Verifica quem chamou (token do usuário logado) e confirma que
//    existe uma linha correspondente em "usuarios" — só um dos dois
//    cadastrados pode registrar despesa.
// 2. Só depois disso usa a service_role key (ignora RLS) pra gravar
//    o resultado — a checagem de permissão já foi feita no passo 1.
//
// Deploy: cole este arquivo em Supabase -> Edge Functions -> New
// function (nome "parse-despesa") -> Deploy. Depois, em Edge
// Functions -> Manage secrets, adicione GROQ_API_KEY com sua chave
// gerada em console.groq.com/keys. SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY já vêm prontos automaticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Únicas categorias/formas de pagamento válidas — mesma lista do
// "check" da tabela despesas (database/schema-supabase.sql). Se
// mudar uma, muda a outra também.
const CATEGORIAS = [
    "Alimentação", "Mercado", "Transporte", "Saúde", "Lazer",
    "Casa", "Educação", "Assinaturas", "Compras", "Outros",
];
const FORMAS_PAGAMENTO = ["crédito", "débito", "pix", "dinheiro", "outro"];
const CONFIANCAS = ["alta", "media", "baixa"];

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
}

function montarPrompt(texto: string, dataAtualISO: string) {
    return `Você extrai dados estruturados de mensagens em português sobre gastos pessoais de um casal. Hoje é ${dataAtualISO}.

Categorias válidas: ${CATEGORIAS.join(", ")}.
Formas de pagamento válidas: ${FORMAS_PAGAMENTO.join(", ")}.

Se a mensagem não for sobre um gasto (ex.: "oi", "bom dia", uma pergunta qualquer), responda eh_despesa=false e deixe os outros campos null.

Se for um gasto mas faltar a forma de pagamento, use "outro".
Se faltar a data, ou a mensagem disser "hoje", use a data de hoje (${dataAtualISO}). Se disser "ontem" ou um dia da semana, calcule a partir de hoje.
Se o valor ou a categoria não puderem ser inferidos com razoável certeza, ainda assim faça sua melhor tentativa, mas marque confianca="baixa". Caso contrário, marque "media" se houve alguma suposição, ou "alta" se a mensagem foi clara.

Mensagem: "${texto}"

Responda APENAS com um JSON no formato exato:
{"eh_despesa": boolean, "valor": number|null, "categoria": string|null, "forma_pagamento": string|null, "descricao": string|null, "data": "YYYY-MM-DD"|null, "confianca": "alta"|"media"|"baixa"|null}
Nada de texto antes ou depois do JSON.`;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: CORS_HEADERS });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return jsonResponse({ error: "Não autenticado." }, 401);
        }

        const clienteChamador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: userData, error: userError } = await clienteChamador.auth.getUser();
        if (userError || !userData?.user) {
            return jsonResponse({ error: "Sessão inválida." }, 401);
        }

        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: usuario } = await admin
            .from("usuarios")
            .select("id, nome")
            .eq("auth_user_id", userData.user.id)
            .maybeSingle();

        if (!usuario) {
            return jsonResponse({ error: "Usuário não cadastrado em 'usuarios'." }, 403);
        }

        const { texto } = await req.json();
        if (!texto || typeof texto !== "string" || !texto.trim()) {
            return jsonResponse({ error: "texto é obrigatório." }, 400);
        }

        const dataAtualISO = new Date().toISOString().slice(0, 10);
        const prompt = montarPrompt(texto.trim(), dataAtualISO);

        const respostaIA = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
            }),
        });

        if (!respostaIA.ok) {
            const erroTexto = await respostaIA.text();
            console.error("Erro da API Groq:", erroTexto);
            return jsonResponse({ error: "Falha ao consultar a IA." }, 502);
        }

        const corpoIA = await respostaIA.json();
        const textoResposta = corpoIA.choices?.[0]?.message?.content;

        if (!textoResposta) {
            return jsonResponse({ error: "A IA não retornou um resultado estruturado." }, 502);
        }

        let extraido;
        try {
            extraido = JSON.parse(textoResposta);
        } catch {
            console.error("Resposta da IA não é JSON válido:", textoResposta);
            return jsonResponse({ error: "A IA não retornou um resultado estruturado." }, 502);
        }

        if (!extraido.eh_despesa) {
            return jsonResponse({ ok: true, registrado: false }, 200);
        }

        // Validação defensiva — nunca confia cegamente no que a IA devolveu
        // antes de gravar (categoria/forma de pagamento fora da lista,
        // valor inválido, etc. viram fallback seguro em vez de erro).
        const valor = Number(extraido.valor);
        if (!valor || valor <= 0) {
            return jsonResponse({ error: "Não consegui identificar um valor válido nessa mensagem." }, 200);
        }

        const categoria = CATEGORIAS.includes(extraido.categoria) ? extraido.categoria : "Outros";
        const formaPagamento = FORMAS_PAGAMENTO.includes(extraido.forma_pagamento) ? extraido.forma_pagamento : "outro";
        const confianca = CONFIANCAS.includes(extraido.confianca) ? extraido.confianca : "media";
        const dataDespesa = /^\d{4}-\d{2}-\d{2}$/.test(extraido.data ?? "") ? extraido.data : dataAtualISO;

        const novaDespesa = {
            usuario_id: usuario.id,
            valor,
            categoria,
            forma_pagamento: formaPagamento,
            descricao: extraido.descricao ?? null,
            data_despesa: dataDespesa,
            mensagem_original: texto.trim(),
            confianca_ia: confianca,
        };

        const { data: inserida, error: erroInsercao } = await admin
            .from("despesas")
            .insert(novaDespesa)
            .select()
            .single();

        if (erroInsercao) {
            console.error("Erro ao gravar despesa:", erroInsercao);
            return jsonResponse({ error: "Entendi o gasto, mas falhou ao salvar." }, 500);
        }

        return jsonResponse({ ok: true, registrado: true, despesa: inserida, usuarioNome: usuario.nome }, 200);

    } catch (erro) {
        console.error("Erro inesperado no parse-despesa:", erro);
        return jsonResponse({ error: "Erro inesperado." }, 500);
    }
});
