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
        criadoEm: linha.criado_em,
        salarioId: linha.salario_id
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

/** Remove um depósito/retirada/ajuste (o trigger no banco desfaz o efeito no saldo). */
async function excluirMovimento(id) {
    const { error } = await supabaseClient.from("carteira_movimentos").delete().eq("id", id);
    if (error) {
        console.error("Falha ao excluir movimento de carteira:", error);
        return false;
    }
    return true;
}

/** Salário mensal de cada pessoa (um valor só por usuário — usuario_id
 *  é único). Não lança sozinho numa data fixa — fica "não efetivado"
 *  na aba Carteiras até você confirmar com efetivarSalario() no dia
 *  real em que o dinheiro cai (adiantado ou atrasado, tanto faz). */
async function buscarSalarios() {
    const { data, error } = await supabaseClient
        .from("salarios")
        .select("*, usuarios(nome)");

    if (error) {
        console.error("Falha ao buscar salários:", error);
        return [];
    }

    return data.map(linha => ({
        id: linha.id,
        usuarioId: linha.usuario_id,
        usuarioNome: linha.usuarios?.nome ?? "-",
        valor: Number(linha.valor),
        ativo: linha.ativo,
        criadoEm: linha.criado_em
    }));
}

/** Cria ou atualiza o salário de uma pessoa (upsert por usuario_id, que é único). */
async function salvarSalario(usuarioId, valor) {
    const { error } = await supabaseClient
        .from("salarios")
        .upsert({ usuario_id: usuarioId, valor, ativo: true }, { onConflict: "usuario_id" });

    if (error) {
        console.error("Falha ao salvar salário:", error);
        return false;
    }
    return true;
}

/** Usado pra pausar/reativar: atualizarSalario(id, { ativo: false }). */
async function atualizarSalario(id, campos) {
    const { error } = await supabaseClient.from("salarios").update(campos).eq("id", id);
    if (error) {
        console.error("Falha ao atualizar salário:", error);
        return false;
    }
    return true;
}

/** Efetiva o salário de uma pessoa nesse mês: cria o depósito de
 *  verdade na carteira dela, na data em que você clicar (não numa data
 *  calculada) — vinculado ao salário (salario_id) só pra saber que
 *  esse mês já foi confirmado e não aparecer mais como projeção. */
async function efetivarSalario(salarioId, usuarioId, valor) {
    const carteira = APP.carteiras.find(c => String(c.usuarioId) === String(usuarioId));
    if (!carteira) {
        console.error("Falha ao efetivar salário: carteira não encontrada pro usuário", usuarioId);
        return false;
    }

    const { error } = await supabaseClient.from("carteira_movimentos").insert({
        carteira_id: carteira.id,
        tipo: "deposito",
        valor,
        descricao: "Salário",
        registrado_por: usuarioId,
        salario_id: salarioId
    });

    if (error) {
        console.error("Falha ao efetivar salário:", error);
        return false;
    }
    return true;
}
