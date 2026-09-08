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
 * Registra uma despesa a partir de texto livre (ex.: "Mercado 150").
 * Categoria (e fixo/parcelamento, se mencionado no texto) a IA
 * descobre sozinha; forma de pagamento e cartão, quando vêm do
 * seletor ao lado do campo (formaPagamento/cartaoId), têm prioridade
 * sobre o que a IA tentar extrair da mensagem. Retorna:
 * - { ok: true, registrado: true, despesa, usuarioNome } — gravou.
 * - { ok: true, registrado: false } — a IA não entendeu isso como
 *   um gasto (ex.: "oi"), nada foi gravado.
 * - { ok: false, mensagem } — erro (rede, IA fora do ar, etc.).
 */
async function registrarDespesa(texto, pessoaAlvo, formaPagamento, cartaoId) {
    const { data, error } = await supabaseClient.functions.invoke("parse-despesa", {
        body: {
            texto,
            pessoaAlvo: pessoaAlvo || null,
            formaPagamentoAlvo: formaPagamento || null,
            cartaoAlvo: cartaoId || null
        }
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
        compartilhada: linha.compartilhada,
        efetivada: linha.efetivada
    }));
}

/** Reatribui a pessoa de uma despesa já existente: um usuário
 *  específico, ou "ambos" pra marcar como compartilhada (uma linha só,
 *  valor cheio — o trigger de saldo no banco debita metade de cada
 *  carteira do casal, ver database/schema-despesas-compartilhadas.sql).
 *  Trocar de "ambos" pra uma pessoa específica desmarca a divisão.
 *
 *  Se a despesa for parcelada (tem parcelaGrupoId), aplica em TODAS as
 *  parcelas da mesma compra — senão só o mês editado mudava de dono,
 *  e as outras parcelas ficavam com a divisão antiga, misturando o
 *  cálculo da fatura entre os meses. */
async function atualizarPessoaDespesa(despesa, usuarioId) {
    const campos = usuarioId === "ambos"
        ? { compartilhada: true }
        : { usuario_id: usuarioId, compartilhada: false };

    const query = supabaseClient.from("despesas").update(campos);
    const { error } = despesa.parcelaGrupoId
        ? await query.eq("parcela_grupo_id", despesa.parcelaGrupoId)
        : await query.eq("id", despesa.id);

    if (error) {
        console.error("Falha ao reatribuir despesa:", error);
        return false;
    }
    return true;
}

/** Reatribui o valor de uma despesa já existente. "aplicarATodas"
 *  decide o alcance quando ela é parcelada ou vem de uma despesa fixa:
 *  - parcelada + aplicarATodas: muda TODAS as parcelas da compra
 *    (mesmo parcelaGrupoId) — senão só aquele mês mudava e as outras
 *    parcelas ficavam com o valor errado da compra original.
 *  - despesa fixa + aplicarATodas: muda esse lançamento, os outros
 *    meses já gerados dessa mesma fixa, E o molde (despesas_fixas),
 *    pros próximos lançamentos automáticos já saírem com o valor novo.
 *  Sem aplicarATodas (ou despesa avulsa), muda só essa linha. O saldo
 *  da carteira se ajusta sozinho — o trigger já compara valor antigo x
 *  novo por linha, e só mexe nas que já estão efetivadas. */
async function atualizarValorDespesa(despesa, valor, aplicarATodas) {
    if (aplicarATodas && despesa.parcelaGrupoId) {
        const { error } = await supabaseClient.from("despesas")
            .update({ valor }).eq("parcela_grupo_id", despesa.parcelaGrupoId);
        if (error) {
            console.error("Falha ao reatribuir valor das parcelas:", error);
            return false;
        }
        return true;
    }

    if (aplicarATodas && despesa.despesaFixaId) {
        const [{ error: erroDespesas }, { error: erroFixa }] = await Promise.all([
            supabaseClient.from("despesas").update({ valor }).eq("despesa_fixa_id", despesa.despesaFixaId),
            supabaseClient.from("despesas_fixas").update({ valor }).eq("id", despesa.despesaFixaId)
        ]);
        if (erroDespesas || erroFixa) {
            console.error("Falha ao reatribuir valor da despesa fixa:", erroDespesas || erroFixa);
            return false;
        }
        return true;
    }

    const { error } = await supabaseClient.from("despesas").update({ valor }).eq("id", despesa.id);
    if (error) {
        console.error("Falha ao reatribuir valor da despesa:", error);
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

/** Reatribui a data de uma despesa já existente — recalcula junto
 *  "efetivada" (data no futuro = ainda não debita a carteira; data
 *  hoje/passado = debita/credita na hora, via trigger no banco). Assim
 *  dá pra lançar uma previsão de gasto pro mês que vem sem ela mexer
 *  no saldo antes da hora, sem precisar de ajuste manual depois. */
async function atualizarDataDespesa(id, dataISO) {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseClient.from("despesas")
        .update({ data_despesa: dataISO, efetivada: dataISO <= hojeISO })
        .eq("id", id);
    if (error) {
        console.error("Falha ao reatribuir data da despesa:", error);
        return false;
    }
    return true;
}

/** Reatribui a descrição de uma despesa já existente. */
async function atualizarDescricaoDespesa(id, descricao) {
    const { error } = await supabaseClient.from("despesas").update({ descricao }).eq("id", id);
    if (error) {
        console.error("Falha ao reatribuir descrição da despesa:", error);
        return false;
    }
    return true;
}

/** Marca uma despesa em aberto (não-crédito, data futura, efetivada
 *  false) como paga hoje: efetivada=true e data_despesa=hoje — mesmo
 *  UPDATE que atualizarDataDespesa já faz ao trazer a data pro
 *  presente, então o trigger no banco (trg_despesas_saldo, ver
 *  database/schema-despesas-efetivada.sql) debita a carteira do
 *  responsável na hora, sem precisar de ajuste nenhum no banco. */
async function marcarDespesaComoPaga(id) {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseClient.from("despesas")
        .update({ efetivada: true, data_despesa: hojeISO })
        .eq("id", id);
    if (error) {
        console.error("Falha ao marcar despesa como paga:", error);
        return false;
    }
    return true;
}

/** Desfaz o "marcar como pago": volta efetivada pra false (a data não
 *  mexe — só o "pago hoje" tinha trazido ela pro presente). O trigger
 *  no banco estorna o débito que tinha sido feito, mesmo raciocínio de
 *  marcarDespesaComoPaga, mas invertido. Só faz sentido fora do
 *  crédito (crédito nunca fica "efetivada" nesse sentido — quem paga é
 *  a fatura inteira, na aba Cartões). */
async function marcarDespesaComoPendente(id) {
    const { error } = await supabaseClient.from("despesas")
        .update({ efetivada: false })
        .eq("id", id);
    if (error) {
        console.error("Falha ao marcar despesa como pendente:", error);
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
