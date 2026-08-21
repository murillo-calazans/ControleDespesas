// ==========================================================
// Edge Function: insights-financeiros
// ==========================================================
// Lê os gastos reais (já acontecidos) dos últimos 6 meses do casal,
// agrega por mês/categoria e manda um resumo pra IA (Groq) analisar
// e sugerir onde economizar. Não grava nada — só leitura + análise.
// Mesmo padrão de auth de duas camadas do parse-despesa: valida o
// usuário chamador com a anon key, só depois usa a service_role key
// pra ler os dados (RLS já garante que só o casal cadastrado chega
// até aqui).
//
// Deploy: supabase functions deploy insights-financeiros --project-ref <ref>
// Secrets: mesmos do parse-despesa (GROQ_API_KEY + SUPABASE_* automáticos).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ_MODEL = "openai/gpt-oss-120b";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MESES_ANALISADOS = 6;

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

function formatarReais(valor: number): string {
    return `R$ ${valor.toFixed(2)}`;
}

/** Primeiro dia do mês, N meses atrás, em "YYYY-MM-DD". */
function inicioDeMesesAtras(n: number): string {
    const hoje = new Date();
    const alvo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 1));
    return alvo.toISOString().slice(0, 10);
}

function montarResumoParaPrompt(
    despesas: { valor: number; categoria: string; data_despesa: string }[],
    saldoTotal: number,
    fixas: { valor: number; categoria: string; descricao: string | null }[],
): string {
    const porMes = new Map<string, Map<string, number>>();
    for (const d of despesas) {
        const mes = d.data_despesa.slice(0, 7);
        if (!porMes.has(mes)) porMes.set(mes, new Map());
        const porCategoria = porMes.get(mes)!;
        porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + Number(d.valor));
    }

    const linhasPorMes = [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, categorias]) => {
            const partes = [...categorias.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([cat, valor]) => `${cat} ${formatarReais(valor)}`)
                .join(", ");
            return `${mes}: ${partes}`;
        })
        .join("\n");

    const totalFixas = fixas.reduce((soma, f) => soma + Number(f.valor), 0);
    const linhasFixas = fixas.map(f => `${f.descricao || f.categoria} (${formatarReais(Number(f.valor))})`).join(", ");

    return `Gastos por mês e categoria (R$), últimos ${MESES_ANALISADOS} meses:
${linhasPorMes || "(sem gastos registrados nesse período)"}

Saldo total atual do casal (soma das duas carteiras): ${formatarReais(saldoTotal)}
Compromisso fixo mensal (aluguel, assinaturas etc): ${formatarReais(totalFixas)}${linhasFixas ? ` — ${linhasFixas}` : ""}`;
}

function montarPrompt(resumo: string): string {
    return `Você é um consultor financeiro pessoal analisando os gastos de um casal brasileiro que usa um app de controle de despesas. Seja direto e prático — nada de conselhos genéricos tipo "gaste menos" ou "faça um orçamento". Cite categorias e valores reais dos dados abaixo.

${resumo}

Responda em JSON no formato exato:
{"resumo": "2 a 3 frases sobre a situação geral: tendência entre os meses, o que mais pesa no orçamento", "dicas": ["3 a 5 dicas específicas e acionáveis, cada uma curta (1 frase), citando categoria/valor quando fizer sentido"]}
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
            .select("id")
            .eq("auth_user_id", userData.user.id)
            .maybeSingle();

        if (!usuario) {
            return jsonResponse({ error: "Usuário não cadastrado em 'usuarios'." }, 403);
        }

        const hojeISO = new Date().toISOString().slice(0, 10);
        const inicioISO = inicioDeMesesAtras(MESES_ANALISADOS - 1);

        const [{ data: despesas }, { data: carteiras }, { data: fixas }] = await Promise.all([
            admin.from("despesas").select("valor, categoria, data_despesa")
                .gte("data_despesa", inicioISO).lte("data_despesa", hojeISO),
            admin.from("carteiras").select("saldo"),
            admin.from("despesas_fixas").select("valor, categoria, descricao").eq("ativa", true),
        ]);

        const saldoTotal = (carteiras ?? []).reduce((soma, c) => soma + Number(c.saldo), 0);
        const resumo = montarResumoParaPrompt(despesas ?? [], saldoTotal, fixas ?? []);
        const prompt = montarPrompt(resumo);

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

        const resumoFinal = typeof extraido.resumo === "string" ? extraido.resumo : "";
        const dicasFinal = Array.isArray(extraido.dicas) ? extraido.dicas.filter((d: unknown) => typeof d === "string") : [];

        if (!resumoFinal && dicasFinal.length === 0) {
            return jsonResponse({ error: "A IA não retornou uma análise válida." }, 502);
        }

        return jsonResponse({ ok: true, resumo: resumoFinal, dicas: dicasFinal }, 200);

    } catch (erro) {
        console.error("Erro inesperado no insights-financeiros:", erro);
        return jsonResponse({ error: "Erro inesperado." }, 500);
    }
});
