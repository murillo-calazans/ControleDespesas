/**
 * ==========================================================
 * Serviço de Carteiras
 * ==========================================================
 * Carteira tem saldo real (coluna "saldo" em carteiras), mantido só
 * por triggers no banco (ver database/schema-carteiras-cartoes-fixas.sql)
 * — nunca é escrito direto daqui. Depósito/retirada/ajuste manual
 * passa por carteira_movimentos, que o trigger lê pra atualizar o saldo.
 */

/** Busca as carteiras do casal (uma por usuário) com saldo atual. */
async function buscarCarteiras() {
    const { data, error } = await supabaseClient
        .from("carteiras")
        .select("*, usuarios(nome)")
        .order("usuario_id");

    if (error) {
        console.error("Falha ao buscar carteiras:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        usuarioId: linha.usuario_id,
        usuarioNome: linha.usuarios?.nome ?? "-",
        saldo: Number(linha.saldo)
    }));
}

/** Histórico de depósitos/retiradas/ajustes manuais, mais recente primeiro. */
async function buscarMovimentos() {
    const { data, error } = await supabaseClient
        .from("carteira_movimentos")
        .select("*, usuarios(nome)")
        .order("criado_em", { ascending: false });

    if (error) {
        console.error("Falha ao buscar movimentos de carteira:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        carteiraId: linha.carteira_id,
        tipo: linha.tipo,
        valor: Number(linha.valor),
        descricao: linha.descricao,
        registradoPorNome: linha.usuarios?.nome ?? "-",
        criadoEm: linha.criado_em
    }));
}

/** Registra um depósito/retirada/ajuste manual numa carteira. */
async function registrarMovimento({ carteiraId, tipo, valor, descricao }) {
    const { error } = await supabaseClient.from("carteira_movimentos").insert({
        carteira_id: carteiraId,
        tipo,
        valor,
        descricao: descricao || null,
        registrado_por: APP.usuario.id
    });

    if (error) {
        console.error("Falha ao registrar movimento de carteira:", error);
        return false;
    }
    return true;
}
