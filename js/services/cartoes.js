/**
 * ==========================================================
 * Serviço de Cartões de Crédito
 * ==========================================================
 * Cadastro de cartões (com dia de fechamento/vencimento reais, pra
 * calcular a fatura por ciclo — ver competenciaFatura em
 * js/ui/cartoes.js) e o registro de pagamento de fatura, que debita
 * a carteira do dono do cartão (via trigger, ver
 * database/schema-carteiras-cartoes-fixas.sql).
 */

/** Busca os cartões cadastrados pelo casal. */
async function buscarCartoes() {
    const { data, error } = await supabaseClient
        .from("cartoes")
        .select("*, usuarios(nome)")
        .order("criado_em");

    if (error) {
        console.error("Falha ao buscar cartões:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        usuarioId: linha.usuario_id,
        usuarioNome: linha.usuarios?.nome ?? "-",
        nome: linha.nome,
        diaFechamento: linha.dia_fechamento,
        diaVencimento: linha.dia_vencimento,
        ativo: linha.ativo
    }));
}

/** Cadastra um novo cartão de crédito, do usuário logado. */
async function criarCartao({ nome, diaFechamento, diaVencimento }) {
    const { error } = await supabaseClient.from("cartoes").insert({
        usuario_id: APP.usuario.id,
        nome,
        dia_fechamento: diaFechamento,
        dia_vencimento: diaVencimento || null
    });

    if (error) {
        console.error("Falha ao criar cartão:", error);
        return false;
    }
    return true;
}

/** Atualiza campos de um cartão (ex.: { ativo: false } pra desativar). */
async function atualizarCartao(id, campos) {
    const { error } = await supabaseClient.from("cartoes").update(campos).eq("id", id);
    if (error) {
        console.error("Falha ao atualizar cartão:", error);
        return false;
    }
    return true;
}

/** Remove um cartão (despesas ligadas a ele ficam com cartao_id nulo). */
async function excluirCartao(id) {
    const { error } = await supabaseClient.from("cartoes").delete().eq("id", id);
    if (error) {
        console.error("Falha ao excluir cartão:", error);
        return false;
    }
    return true;
}

/** Marca a fatura de uma competência (mês) como paga — debita a carteira do dono do cartão. */
async function marcarFaturaPaga({ cartaoId, competencia, valorPago, dataPagamento }) {
    const { error } = await supabaseClient.from("fatura_pagamentos").insert({
        cartao_id: cartaoId,
        competencia,
        valor_pago: valorPago,
        data_pagamento: dataPagamento || new Date().toISOString().slice(0, 10)
    });

    if (error) {
        console.error("Falha ao marcar fatura como paga:", error);
        return false;
    }
    return true;
}

/** Faturas já pagas de um cartão (pra saber quais competências marcar como quitadas). */
async function buscarFaturaPagamentos(cartaoId) {
    const { data, error } = await supabaseClient
        .from("fatura_pagamentos")
        .select("*")
        .eq("cartao_id", cartaoId);

    if (error) {
        console.error("Falha ao buscar pagamentos de fatura:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        cartaoId: linha.cartao_id,
        competencia: linha.competencia,
        valorPago: Number(linha.valor_pago),
        dataPagamento: linha.data_pagamento
    }));
}
