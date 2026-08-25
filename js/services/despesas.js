/**
 * ==========================================================
 * Serviço de Despesas
 * ==========================================================
 * registrarDespesa() manda o texto livre pra Edge Function
 * parse-despesa (que chama a IA e já grava — ver
 * supabase/functions/parse-despesa/index.ts); buscarDespesas() lê
 * tudo de volta do Supabase pro dashboard renderizar.
 */

/**
 * Registra uma despesa a partir de texto livre (ex.: "Gastei 10 reais
 * na padaria no crédito"). Retorna:
 * - { ok: true, registrado: true, despesa, usuarioNome } — gravou.
 * - { ok: true, registrado: false } — a IA não entendeu isso como
 *   um gasto (ex.: "oi"), nada foi gravado.
 * - { ok: false, mensagem } — erro (rede, IA fora do ar, etc.).
 */
async function registrarDespesa(texto, pessoaAlvo) {
    const { data, error } = await supabaseClient.functions.invoke("parse-despesa", {
        body: { texto, pessoaAlvo: pessoaAlvo || null }
    });

    if (error) {
        console.error("Falha ao chamar parse-despesa:", error);
        return { ok: false, mensagem: "Falha ao registrar. Veja o console pra detalhes." };
    }

    if (data?.error) {
        return { ok: false, mensagem: data.error };
    }

    return {
        ok: true,
        tipo: data.tipo,
        registrado: data.registrado,
        despesa: data.despesa,
        parcelas: data.parcelas,
        investimento: data.investimento,
        dividido: data.dividido,
        valorTotal: data.valorTotal,
        fixoRegistrado: data.fixoRegistrado,
        usuarioNome: data.usuarioNome
    };
}

/**
 * Busca todas as despesas do casal (RLS já garante que só quem está
 * logado como um dos dois usuários enxerga isso), com o nome de quem
 * registrou já resolvido via o relacionamento com "usuarios".
 */
async function buscarDespesas() {
    const { data, error } = await supabaseClient
        .from("despesas")
        .select("*, usuarios(nome)")
        .order("data_despesa", { ascending: false })
        .order("criado_em", { ascending: false });

    if (error) {
        console.error("Falha ao buscar despesas:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        usuarioId: linha.usuario_id,
        usuarioNome: linha.usuarios?.nome ?? "-",
        valor: Number(linha.valor),
        categoria: linha.categoria,
        formaPagamento: linha.forma_pagamento,
        cartaoId: linha.cartao_id,
        despesaFixaId: linha.despesa_fixa_id,
        descricao: linha.descricao,
        parcelaAtual: linha.parcela_atual,
        parcelaTotal: linha.parcela_total,
        parcelaGrupoId: linha.parcela_grupo_id,
        dataDespesa: linha.data_despesa,
        mensagemOriginal: linha.mensagem_original,
        confiancaIA: linha.confianca_ia,
        compartilhada: linha.compartilhada
    }));
}

/** Reatribui a pessoa de uma despesa já existente: um usuário
 *  específico, ou "ambos" pra marcar como compartilhada (uma linha só,
 *  valor cheio — o trigger de saldo no banco debita metade de cada
 *  carteira do casal, ver database/schema-despesas-compartilhadas.sql).
 *  Trocar de "ambos" pra uma pessoa específica desmarca a divisão. */
async function atualizarPessoaDespesa(id, usuarioId) {
    const campos = usuarioId === "ambos"
        ? { compartilhada: true }
        : { usuario_id: usuarioId, compartilhada: false };

    const { error } = await supabaseClient.from("despesas").update(campos).eq("id", id);
    if (error) {
        console.error("Falha ao reatribuir despesa:", error);
        return false;
    }
    return true;
}

/** Reatribui a forma de pagamento de uma despesa já existente — se for
 *  num cartão de crédito, já define junto qual cartão (cartaoId),
 *  numa atualização só. Define em qual fatura ela entra. */
async function atualizarFormaPagamentoDespesa(id, formaPagamento, cartaoId) {
    const { error } = await supabaseClient.from("despesas").update({
        forma_pagamento: formaPagamento,
        cartao_id: cartaoId || null
    }).eq("id", id);
    if (error) {
        console.error("Falha ao reatribuir forma de pagamento da despesa:", error);
        return false;
    }
    return true;
}

/** Reatribui a categoria de uma despesa já existente. */
async function atualizarCategoriaDespesa(id, categoria) {
    const { error } = await supabaseClient.from("despesas").update({ categoria }).eq("id", id);
    if (error) {
        console.error("Falha ao reatribuir categoria da despesa:", error);
        return false;
    }
    return true;
}

/** Remove uma despesa (RLS exige estar logado como um dos dois usuários). */
async function excluirDespesa(id) {
    const { error } = await supabaseClient.from("despesas").delete().eq("id", id);
    if (error) {
        console.error("Falha ao excluir despesa:", error);
        return false;
    }
    return true;
}
