/**
 * ==========================================================
 * Serviço de Investimentos
 * ==========================================================
 * Registro em si acontece pela mesma Edge Function parse-despesa
 * (ver registrarDespesa em js/services/despesas.js) — a IA que
 * classifica se o texto é despesa ou investimento. Aqui só busca/exclui.
 */

/** Number.isFinite (em vez de só checar "!== null") blinda contra um
 *  NaN que eventualmente já esteja gravado — Postgres "numeric" aceita
 *  NaN como valor, e o check original não barrava isso (ver
 *  database/schema-investimentos-taxa-juros-fix.sql). Sem isso um NaN
 *  vazava pro campo de taxa em js/ui/investimentos.js. */
function taxaJurosValidaOuNull(valorBruto) {
    const taxa = Number(valorBruto);
    return valorBruto !== null && Number.isFinite(taxa) ? taxa : null;
}

async function buscarInvestimentos() {
    const { data, error } = await supabaseClient
        .from("investimentos")
        .select("*, usuarios(nome)")
        .order("data_investimento", { ascending: false })
        .order("criado_em", { ascending: false });

    if (error) {
        console.error("Falha ao buscar investimentos:", error);
        return [];
    }

    return data.map(linha => {
        const taxaJuros = taxaJurosValidaOuNull(linha.taxa_juros);
        return {
            id: linha.id,
            usuarioId: linha.usuario_id,
            usuarioNome: linha.usuarios?.nome ?? "-",
            valor: Number(linha.valor),
            conta: linha.conta,
            descricao: linha.descricao,
            dataInvestimento: linha.data_investimento,
            mensagemOriginal: linha.mensagem_original,
            confiancaIA: linha.confianca_ia,
            // Rendimento configurado manualmente (ver
            // database/schema-investimentos-taxa-juros.sql) — os dois
            // vêm juntos ou nenhum dos dois (constraint no banco).
            taxaJuros,
            periodoTaxa: taxaJuros === null ? null : linha.periodo_taxa
        };
    });
}

async function excluirInvestimento(id) {
    const { error } = await supabaseClient.from("investimentos").delete().eq("id", id);
    if (error) {
        console.error("Falha ao excluir investimento:", error);
        return false;
    }
    return true;
}

/** Configura (ou limpa, passando ambos null) a taxa de rendimento de
 *  um investimento já cadastrado — editável a qualquer momento, não só
 *  na criação.
 *
 *  Validação defensiva ANTES de falar com o Supabase: taxaJuros
 *  precisa ser null (limpar) ou um número finito >= 0, e periodoTaxa
 *  precisa vir junto (mensal/anual) sempre que taxaJuros não for null
 *  — mesma regra da constraint no banco. Sem isso, um NaN/undefined
 *  vindo da UI (ex.: campo vazio mal tratado, "0,8" com vírgula não
 *  convertida) vira um PATCH inválido pro PostgREST e estoura 400 —
 *  melhor barrar aqui, com uma mensagem de erro que a UI consegue
 *  mostrar, do que deixar a request ir pro ar. */
async function atualizarTaxaJurosInvestimento(id, taxaJuros, periodoTaxa) {
    const taxaValida = taxaJuros === null || (Number.isFinite(taxaJuros) && taxaJuros >= 0);
    const periodoValido = taxaJuros === null ? periodoTaxa === null : (periodoTaxa === "mensal" || periodoTaxa === "anual");

    if (!taxaValida || !periodoValido) {
        console.error("Taxa de juros inválida, não enviada ao Supabase:", { id, taxaJuros, periodoTaxa });
        return false;
    }

    const { error } = await supabaseClient
        .from("investimentos")
        .update({ taxa_juros: taxaJuros, periodo_taxa: periodoTaxa })
        .eq("id", id);

    if (error) {
        console.error("Falha ao atualizar taxa de juros do investimento:", error);
        return false;
    }
    return true;
}
