// ==========================================================
// Edge Function: parse-despesa
// ==========================================================
// Recebe um texto livre (ex.: "Gastei 10 reais na padaria no
// crédito" ou "Investi 500 na XP"), usa a API da Groq (gratuita, sem
// cartão) pra extrair dados estruturados em JSON, e já grava o
// resultado (numa despesa ou num investimento, dependendo do que a
// IA classificou). A chave da API fica só aqui (variável de ambiente
// da function) — nunca chega no navegador.
//
// Segurança em duas camadas:
// 1. Verifica quem chamou (token do usuário logado) e confirma que
//    existe uma linha correspondente em "usuarios" — só um dos dois
//    cadastrados pode registrar despesa/investimento.
// 2. Só depois disso usa a service_role key (ignora RLS) pra gravar
//    o resultado — a checagem de permissão já foi feita no passo 1.
//
// Deploy: supabase functions deploy parse-despesa --project-ref <ref>
// (ou cole em Supabase -> Edge Functions -> parse-despesa -> Deploy).
// Secrets necessários (Edge Functions -> Manage secrets):
// GROQ_API_KEY. SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// já vêm prontos automaticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
// llama-3.3-70b-versatile foi descontinuado pela Groq — openai/gpt-oss-120b
// é o modelo de propósito geral recomendado no lugar (com suporte a JSON
// mode), disponível no tier gratuito.
const GROQ_MODEL = "openai/gpt-oss-120b";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Únicas categorias/formas de pagamento válidas — mesma lista do
// "check" das tabelas despesas/despesas_fixas (database/schema-supabase.sql
// e database/schema-carteiras-cartoes-fixas.sql). Se mudar uma, muda as outras.
const CATEGORIAS = [
    "Alimentação", "Mercado", "Transporte", "Saúde", "Lazer",
    "Casa", "Educação", "Assinaturas", "Compras", "Outros",
];
const FORMAS_PAGAMENTO = ["crédito", "débito", "pix", "dinheiro", "outro"];
const CONFIANCAS = ["alta", "media", "baixa"];
const TIPOS = ["despesa", "investimento", "nenhum"];

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

function montarPrompt(texto: string, dataAtualISO: string, nomesCartoes: string[]) {
    return `Você extrai dados estruturados de mensagens em português sobre finanças pessoais de um casal. Hoje é ${dataAtualISO}.

Classifique a mensagem em um "tipo":
- "despesa": um gasto (ex.: "gastei", "paguei", "comprei X").
- "investimento": dinheiro investido/aplicado/guardado (ex.: "investi", "apliquei", "comprei ações", "coloquei na poupança/CDB/cripto").
- "nenhum": qualquer outra coisa (saudação, pergunta, mensagem sem relação com dinheiro).

Categorias válidas (só se tipo="despesa"): ${CATEGORIAS.join(", ")}.
Formas de pagamento válidas (só se tipo="despesa"): ${FORMAS_PAGAMENTO.join(", ")}.
Cartões de crédito cadastrados: ${nomesCartoes.length ? nomesCartoes.join(", ") : "(nenhum cadastrado ainda)"}.

Se a forma de pagamento for "crédito" e a mensagem citar um cartão, tente casar com um dos nomes cadastrados acima e devolva em "cartao" o nome mais parecido (ou o texto citado, se nenhum bater). Se não citar cartão nenhum, "cartao"=null.

Se tipo="despesa" e a mensagem sugerir que é recorrente/mensal (palavras como "fixo", "todo mês", "mensal", "assinatura", "recorrente"), marque "fixo"=true. Caso contrário "fixo"=false.

Se tipo="despesa" e a mensagem indicar uma compra parcelada — números como "2/5", "parcela 2 de 5", "em 5x", "3x de 100" — preencha "parcela_atual" e "parcela_total" com inteiros (ex.: "2/5" -> parcela_atual=2, parcela_total=5). Se a mensagem disser "em 5x" sem indicar qual parcela, assuma parcela_atual=1. Se a mensagem der o valor TOTAL da compra (ex.: "sofá de 3000 em 6x"), calcule "valor" como o valor de UMA parcela (3000/6=500), não o total. Se a mensagem já disser quanto foi pago naquela parcela (ex.: "paguei roupas 500, parcela 2/5"), use esse valor direto, sem dividir. Se não houver menção a parcelamento, "parcela_atual" e "parcela_total" ficam null. Uma compra parcelada nunca é "fixo" — se detectar parcelamento, marque "fixo"=false.

Se tipo="investimento", tente identificar em "conta" a corretora/banco/plataforma citada (ex.: "XP", "Nubank", "Binance"); se não identificar, "conta"=null.

Em "descricao", devolva um resumo curto e limpo do que foi comprado/pago (1 a 4 palavras), sempre em português correto (corrija erros de digitação). Nunca inclua nela o valor, a forma de pagamento, o cartão, a parcela (tipo "2/5") ou palavras como "fixo"/"todo mês"/"mensal". Exemplos: "870 Alugel fixo" -> "Aluguel"; "gastei 50 reais de uber" -> "Uber"; "paguei a conta de luz" -> "Conta de luz"; "30 no ifood no crédito" -> "iFood"; "paguei roupas 500 2/5" -> "Roupas". Se não der pra extrair nada específico, use o nome da categoria.

Se faltar a forma de pagamento numa despesa, use "outro".
Se faltar a data, ou a mensagem disser "hoje", use a data de hoje (${dataAtualISO}). Se disser "ontem" ou um dia da semana, calcule a partir de hoje.
Se o valor ou a categoria não puderem ser inferidos com razoável certeza, ainda assim faça sua melhor tentativa, mas marque confianca="baixa". Caso contrário, marque "media" se houve alguma suposição, ou "alta" se a mensagem foi clara.

Mensagem: "${texto}"

Responda APENAS com um JSON no formato exato:
{"tipo": "despesa"|"investimento"|"nenhum", "valor": number|null, "categoria": string|null, "forma_pagamento": string|null, "cartao": string|null, "conta": string|null, "descricao": string|null, "data": "YYYY-MM-DD"|null, "fixo": boolean, "parcela_atual": number|null, "parcela_total": number|null, "confianca": "alta"|"media"|"baixa"|null}
Nada de texto antes ou depois do JSON.`;
}

/** Soma "meses" à data ISO informada, mantendo o dia (ou o último dia
 *  do mês alvo, se o mês for mais curto — ex.: 31/01 + 1 mês -> 28 ou
 *  29/02). Usada pra espalhar as parcelas de uma compra parcelada,
 *  uma por mês, a partir da data da mensagem. */
function somarMeses(dataISO: string, meses: number): string {
    if (meses === 0) return dataISO;
    const [ano, mes, dia] = dataISO.split("-").map(Number);
    const totalMeses = (mes - 1) + meses;
    const anoAlvo = ano + Math.floor(totalMeses / 12);
    const mesAlvo = ((totalMeses % 12) + 12) % 12;
    const ultimoDiaMesAlvo = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
    const diaAlvo = Math.min(dia, ultimoDiaMesAlvo);
    return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, "0")}-${String(diaAlvo).padStart(2, "0")}`;
}

/** Casa o nome de cartão citado na mensagem com um cartão cadastrado
 *  (igualdade exata primeiro, depois substring, ambos case-insensitive).
 *  Só faz sentido se a forma de pagamento for "crédito". */
function encontrarCartao(
    cartaoTexto: string | null,
    formaPagamento: string,
    cartoes: { id: number; nome: string }[],
): number | null {
    if (formaPagamento !== "crédito" || !cartaoTexto) return null;
    const alvo = cartaoTexto.trim().toLowerCase();
    if (!alvo) return null;

    const exato = cartoes.find(c => c.nome.toLowerCase() === alvo);
    if (exato) return exato.id;

    const parcial = cartoes.find(c =>
        c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase())
    );
    return parcial ? parcial.id : null;
}

/** Reaproveita uma despesa_fixa existente do mesmo usuário/categoria/valor/
 *  descrição (evita duplicar o template a cada vez que a IA marca "fixo"
 *  pra um gasto recorrente que já foi registrado antes). */
async function resolverDespesaFixaId(
    // deno-lint-ignore no-explicit-any
    admin: any,
    usuarioId: string,
    categoria: string,
    valor: number,
    descricao: string | null,
): Promise<number | null> {
    const { data: candidatas } = await admin
        .from("despesas_fixas")
        .select("id, descricao")
        .eq("usuario_id", usuarioId)
        .eq("categoria", categoria)
        .eq("valor", valor)
        .eq("ativa", true);

    const chave = (descricao ?? "").trim().toLowerCase();
    const encontrada = (candidatas ?? []).find(
        (c: { descricao: string | null }) => (c.descricao ?? "").trim().toLowerCase() === chave
    );
    return encontrada ? encontrada.id : null;
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

        const { texto, pessoaAlvo } = await req.json();
        if (!texto || typeof texto !== "string" || !texto.trim()) {
            return jsonResponse({ error: "texto é obrigatório." }, 400);
        }

        const [{ data: cartoesAtivos }, { data: todosUsuarios }] = await Promise.all([
            admin.from("cartoes").select("id, nome").eq("ativo", true),
            admin.from("usuarios").select("id"),
        ]);

        // "pessoaAlvo" vem do seletor Isabela/Murillo/Ambos no campo de
        // texto — deixa qualquer um dos dois lançar em nome do outro (ou
        // dividir 1/2 pra cada). Só aceita um id que exista mesmo em
        // "usuarios" (nunca confia cegamente no que o cliente manda); sem
        // seletor ou valor inválido, cai no comportamento de sempre (quem
        // está logado).
        const idsValidos = (todosUsuarios ?? []).map((u: { id: string }) => u.id);
        const usuariosAlvo: string[] =
            pessoaAlvo === "ambos" && idsValidos.length > 0
                ? idsValidos
                : typeof pessoaAlvo === "string" && idsValidos.includes(pessoaAlvo)
                    ? [pessoaAlvo]
                    : [usuario.id];

        const dataAtualISO = new Date().toISOString().slice(0, 10);
        const prompt = montarPrompt(texto.trim(), dataAtualISO, (cartoesAtivos ?? []).map((c: { nome: string }) => c.nome));

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

        const tipo = TIPOS.includes(extraido.tipo) ? extraido.tipo : "nenhum";

        if (tipo === "nenhum") {
            return jsonResponse({ ok: true, tipo: "nenhum", registrado: false }, 200);
        }

        // Validação defensiva — nunca confia cegamente no que a IA devolveu
        // antes de gravar (categoria/forma de pagamento fora da lista,
        // valor inválido, etc. viram fallback seguro em vez de erro).
        const valor = Number(extraido.valor);
        if (!valor || valor <= 0) {
            return jsonResponse({ error: "Não consegui identificar um valor válido nessa mensagem." }, 200);
        }

        const confianca = CONFIANCAS.includes(extraido.confianca) ? extraido.confianca : "media";
        const dataResultado = /^\d{4}-\d{2}-\d{2}$/.test(extraido.data ?? "") ? extraido.data : dataAtualISO;

        if (tipo === "investimento") {
            const valorPorPessoa = valor / usuariosAlvo.length;
            const linhasInvestimento = usuariosAlvo.map(uid => ({
                usuario_id: uid,
                valor: valorPorPessoa,
                conta: extraido.conta ?? null,
                descricao: extraido.descricao ?? null,
                data_investimento: dataResultado,
                mensagem_original: texto.trim(),
                confianca_ia: confianca,
            }));

            const { data: inseridos, error: erroInsercao } = await admin
                .from("investimentos")
                .insert(linhasInvestimento)
                .select();

            if (erroInsercao) {
                console.error("Erro ao gravar investimento:", erroInsercao);
                return jsonResponse({ error: "Entendi o investimento, mas falhou ao salvar." }, 500);
            }

            return jsonResponse({
                ok: true, tipo: "investimento", registrado: true,
                investimento: inseridos[0], dividido: usuariosAlvo.length > 1, valorTotal: valor,
                usuarioNome: usuario.nome,
            }, 200);
        }

        // tipo === "despesa"
        const categoria = CATEGORIAS.includes(extraido.categoria) ? extraido.categoria : "Outros";

        // Compra parcelada ("2/5", "em 5x") — sem forma de pagamento
        // explícita, assume crédito (é como parcelamento normalmente
        // acontece).
        const parcelaAtualBruta = Number(extraido.parcela_atual);
        const parcelaTotalBruta = Number(extraido.parcela_total);
        const temParcelas = Number.isInteger(parcelaAtualBruta) && Number.isInteger(parcelaTotalBruta)
            && parcelaAtualBruta >= 1 && parcelaTotalBruta >= parcelaAtualBruta && parcelaTotalBruta <= 60;

        const formaPagamento = FORMAS_PAGAMENTO.includes(extraido.forma_pagamento)
            ? extraido.forma_pagamento
            : (temParcelas ? "crédito" : "outro");
        const descricao = extraido.descricao ?? null;
        const cartaoId = encontrarCartao(extraido.cartao ?? null, formaPagamento, cartoesAtivos ?? []);

        const valorPorPessoa = valor / usuariosAlvo.length;

        if (temParcelas) {
            const parcelaGrupoId = crypto.randomUUID();
            const linhas = [];
            for (let n = parcelaAtualBruta; n <= parcelaTotalBruta; n++) {
                for (const uid of usuariosAlvo) {
                    linhas.push({
                        usuario_id: uid,
                        valor: valorPorPessoa,
                        categoria,
                        forma_pagamento: formaPagamento,
                        cartao_id: cartaoId,
                        descricao,
                        data_despesa: somarMeses(dataResultado, n - parcelaAtualBruta),
                        mensagem_original: texto.trim(),
                        confianca_ia: confianca,
                        despesa_fixa_id: null,
                        parcela_atual: n,
                        parcela_total: parcelaTotalBruta,
                        parcela_grupo_id: parcelaGrupoId,
                    });
                }
            }

            const { data: inseridas, error: erroInsercaoParcelas } = await admin
                .from("despesas")
                .insert(linhas)
                .select();

            if (erroInsercaoParcelas) {
                console.error("Erro ao gravar despesas parceladas:", erroInsercaoParcelas);
                return jsonResponse({ error: "Entendi a compra parcelada, mas falhou ao salvar." }, 500);
            }

            return jsonResponse({
                ok: true, tipo: "despesa", registrado: true,
                despesa: inseridas[0], parcelas: inseridas.filter(d => d.usuario_id === inseridas[0].usuario_id),
                dividido: usuariosAlvo.length > 1, valorTotal: valor,
                usuarioNome: usuario.nome, fixoRegistrado: false,
            }, 200);
        }

        // Uma linha de despesa por pessoa em "usuariosAlvo" (normalmente
        // só quem está logado; duas linhas — valor dividido ao meio — se
        // o seletor no campo de texto estiver em "Ambos"). Despesa fixa
        // também precisa de um template por pessoa, já que
        // despesas_fixas.usuario_id não aceita null.
        let algumFixoRegistrado = false;
        const linhasDespesa = [];
        for (const uid of usuariosAlvo) {
            let despesaFixaId: number | null = null;
            if (extraido.fixo === true) {
                despesaFixaId = await resolverDespesaFixaId(admin, uid, categoria, valorPorPessoa, descricao);
                if (despesaFixaId === null) {
                    const diaLancamento = Number(dataResultado.slice(8, 10));
                    const { data: novaFixa, error: erroFixa } = await admin
                        .from("despesas_fixas")
                        .insert({
                            usuario_id: uid, valor: valorPorPessoa, categoria, forma_pagamento: formaPagamento,
                            cartao_id: cartaoId, descricao, dia_lancamento: diaLancamento,
                            mensagem_original: texto.trim(),
                        })
                        .select("id")
                        .single();
                    if (erroFixa) console.error("Erro ao criar despesa fixa (seguindo sem marcar):", erroFixa);
                    else despesaFixaId = novaFixa.id;
                }
                if (despesaFixaId !== null) algumFixoRegistrado = true;
            }

            linhasDespesa.push({
                usuario_id: uid,
                valor: valorPorPessoa,
                categoria,
                forma_pagamento: formaPagamento,
                cartao_id: cartaoId,
                descricao,
                data_despesa: dataResultado,
                mensagem_original: texto.trim(),
                confianca_ia: confianca,
                despesa_fixa_id: despesaFixaId,
            });
        }

        const { data: inseridas, error: erroInsercao } = await admin
            .from("despesas")
            .insert(linhasDespesa)
            .select();

        if (erroInsercao) {
            console.error("Erro ao gravar despesa:", erroInsercao);
            return jsonResponse({ error: "Entendi o gasto, mas falhou ao salvar." }, 500);
        }

        return jsonResponse({
            ok: true, tipo: "despesa", registrado: true, despesa: inseridas[0],
            dividido: usuariosAlvo.length > 1, valorTotal: valor,
            usuarioNome: usuario.nome, fixoRegistrado: algumFixoRegistrado,
        }, 200);

    } catch (erro) {
        console.error("Erro inesperado no parse-despesa:", erro);
        return jsonResponse({ error: "Erro inesperado." }, 500);
    }
});
