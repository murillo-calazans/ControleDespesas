/**
 * ==========================================================
 * Serviço de Despesas Fixas
 * ==========================================================
 * O template em si é criado automaticamente pela Edge Function
 * parse-despesa quando a IA detecta um gasto recorrente (ver
 * resolverDespesaFixaId em supabase/functions/parse-despesa/index.ts).
 * O lançamento mensal automático roda no banco via pg_cron
 * (lancar_despesas_fixas, ver database/schema-carteiras-cartoes-fixas.sql).
 * Aqui só busca/pausa/exclui.
 */

async function buscarDespesasFixas() {
    const { data, error } = await supabaseClient
        .from("despesas_fixas")
        .select("*, usuarios(nome), cartoes(nome)")
        .order("criado_em", { ascending: false });

    if (error) {
        console.error("Falha ao buscar despesas fixas:", error);
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
        cartaoNome: linha.cartoes?.nome ?? null,
        descricao: linha.descricao,
        diaLancamento: linha.dia_lancamento,
        ativa: linha.ativa
    }));
}

/** Usado pra pausar/reativar: atualizarDespesaFixa(id, { ativa: false }). */
async function atualizarDespesaFixa(id, campos) {
    const { error } = await supabaseClient.from("despesas_fixas").update(campos).eq("id", id);
    if (error) {
        console.error("Falha ao atualizar despesa fixa:", error);
        return false;
    }
    return true;
}

async function excluirDespesaFixa(id) {
    const { error } = await supabaseClient.from("despesas_fixas").delete().eq("id", id);
    if (error) {
        console.error("Falha ao excluir despesa fixa:", error);
        return false;
    }
    return true;
}
