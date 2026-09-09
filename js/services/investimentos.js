/**
 * ==========================================================
 * Serviço de Investimentos
 * ==========================================================
 * Registro em si acontece pela mesma Edge Function parse-despesa
 * (ver registrarDespesa em js/services/despesas.js) — a IA que
 * classifica se o texto é despesa ou investimento. Aqui só busca/exclui.
 */

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

    return data.map(linha => ({
        id: linha.id,
        usuarioId: linha.usuario_id,
        usuarioNome: linha.usuarios?.nome ?? "-",
        valor: Number(linha.valor),
        conta: linha.conta,
        descricao: linha.descricao,
        dataInvestimento: linha.data_investimento,
        mensagemOriginal: linha.mensagem_original,
        confiancaIA: linha.confianca_ia,
        // Rendimento configurado manualmente (ver database/schema-investimentos-taxa-juros.sql)
        // — os dois vêm juntos ou nenhum dos dois (constraint no banco).
        taxaJuros: linha.taxa_juros === null ? null : Number(linha.taxa_juros),
        periodoTaxa: linha.periodo_taxa
    }));
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
 *  na criação. */
async function atualizarTaxaJurosInvestimento(id, taxaJuros, periodoTaxa) {
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
