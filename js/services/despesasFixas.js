/**
 * ==========================================================
 * Serviço de Despesas Fixas
 * ==========================================================
 * O template em si é criado automaticamente pela Edge Function
 * parse-despesa quando a IA detecta um gasto recorrente (ver
 * resolverDespesaFixaId em supabase/functions/parse-despesa/index.ts).
 * O lançamento mensal automático roda no banco via pg_cron, sempre no
 * 5º dia útil do mês pra todo mundo (ver lancar_despesas_fixas em
 * database/schema-fixas-quinto-dia-util.sql). Aqui só busca/pausa/exclui.
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
        ativa: linha.ativa,
        compartilhada: linha.compartilhada,
        criadoEm: linha.criado_em
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

/** Meses ("YYYY-MM") em que uma despesa fixa foi marcada pra pular —
 *  ver pularDespesaFixa. */
async function buscarDespesasFixasPuladas() {
    const { data, error } = await supabaseClient.from("despesas_fixas_puladas").select("*");
    if (error) {
        console.error("Falha ao buscar despesas fixas puladas:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        despesaFixaId: linha.despesa_fixa_id,
        mes: linha.mes.slice(0, 7)
    }));
}

/** Pula uma despesa fixa só nesse mês (imprevisto) — não lança
 *  automaticamente nem aparece como "prevista" nele, mas o molde
 *  continua ativo e volta ao normal no mês seguinte. */
async function pularDespesaFixa(despesaFixaId, mesChave) {
    const { error } = await supabaseClient.from("despesas_fixas_puladas").insert({
        despesa_fixa_id: despesaFixaId,
        mes: `${mesChave}-01`
    });
    if (error) {
        console.error("Falha ao pular despesa fixa:", error);
        return false;
    }
    return true;
}
