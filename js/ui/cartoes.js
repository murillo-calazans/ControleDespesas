/**
 * ==========================================================
 * UI de Cartões de Crédito
 * ==========================================================
 * Cadastro de cartão + fatura por ciclo de fechamento real (não mês
 * civil): clica num cartão, vê a fatura da competência atual, navega
 * entre meses, marca como paga (debita a carteira do dono via trigger).
 */

let cartaoSelecionadoId = null;
let competenciaSelecionada = null; // "YYYY-MM"
let pagamentosFaturaCache = [];
let pessoaFaturaSelecionada = null; // null = "Total" (todo mundo); senão, usuarioId
let cartaoEditandoId = null; // cartão com o form de fechamento/vencimento aberto

function registrarCartoes() {
    const form = document.getElementById("formNovoCartao");
    if (form) form.addEventListener("submit", aoCriarCartao);

    const btnAnterior = document.getElementById("btnFaturaAnterior");
    const btnProxima = document.getElementById("btnFaturaProxima");
    if (btnAnterior) btnAnterior.addEventListener("click", () => mudarCompetencia(-1));
    if (btnProxima) btnProxima.addEventListener("click", () => mudarCompetencia(1));

    const btnMarcarPaga = document.getElementById("btnMarcarFaturaPaga");
    if (btnMarcarPaga) btnMarcarPaga.addEventListener("click", aoMarcarFaturaPaga);
}

async function aoCriarCartao(evento) {
    evento.preventDefault();

    const nome = document.getElementById("cartaoNome").value.trim();
    const diaFechamento = Number(document.getElementById("cartaoDiaFechamento").value);
    const diaVencimento = Number(document.getElementById("cartaoDiaVencimento").value) || null;
    const botao = document.getElementById("btnCriarCartao");

    if (!nome || !diaFechamento) return;

    botao.disabled = true;
    const ok = await criarCartao({ nome, diaFechamento, diaVencimento });
    botao.disabled = false;

    if (!ok) {
        alert("Não foi possível cadastrar o cartão. Veja o console pra detalhes.");
        return;
    }

    document.getElementById("formNovoCartao").reset();
    APP.cartoes = await buscarCartoes();
    renderizarCartoes();
    popularFormaPagamentoNovaDespesa();
}

/** "YYYY-MM" da fatura em que uma despesa cai, dado o dia de corte do
 *  cartão (fechamento ou vencimento — ver diaCorteFatura). Compra até
 *  esse dia (incluso) entra na fatura desse mês; depois dele, na do
 *  mês seguinte. */
function competenciaFatura(dataISO, diaCorte) {
    let [ano, mes, dia] = dataISO.split("-").map(Number);
    if (dia > diaCorte) {
        mes += 1;
        if (mes > 12) { mes = 1; ano += 1; }
    }
    return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Dia que decide em qual fatura uma despesa cai: o vencimento, quando
 *  cadastrado (compra até o dia do vencimento entra na fatura desse
 *  mês, só depois dele vai pra próxima — é assim que esse casal pensa
 *  o ciclo, não pelo fechamento em si); sem vencimento cadastrado,
 *  cai pro fechamento. */
function diaCorteFatura(cartao) {
    return cartao.diaVencimento || cartao.diaFechamento;
}

function somarMesACompetencia(competencia, delta) {
    let [ano, mes] = competencia.split("-").map(Number);
    mes += delta;
    while (mes > 12) { mes -= 12; ano += 1; }
    while (mes < 1) { mes += 12; ano -= 1; }
    return `${ano}-${String(mes).padStart(2, "0")}`;
}

function rotuloCompetencia(competencia) {
    const [ano, mes] = competencia.split("-");
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mes) - 1]}/${ano}`;
}

/** Despesas fixas ativas nesse cartão que ainda não têm lançamento
 *  real na fatura de "competencia" (o cron só cria no 5º dia útil do
 *  mês — ver database/schema-fixas-quinto-dia-util.sql) nem foram
 *  puladas — devolve como projeção, mesma ideia de
 *  despesasFixasVirtuaisParaMes em js/ui/dashboard.js, só que pela
 *  competência da fatura em vez do mês calendário. Assim a fatura já
 *  aparece completa (Netflix, assinaturas etc.) mesmo antes do
 *  lançamento automático acontecer, em vez de ficar "presa" só no
 *  relatório de Despesas. */
function despesasFixasVirtuaisParaFatura(cartao, competencia) {
    return APP.despesasFixas
        .filter(f => f.ativa && String(f.cartaoId) === String(cartao.id))
        .filter(f => !APP.despesas.some(d =>
            d.despesaFixaId === f.id && competenciaFatura(d.dataDespesa, diaCorteFatura(cartao)) === competencia
        ))
        .filter(f => !APP.despesasFixasPuladas.some(p => p.despesaFixaId === f.id && p.mes === competencia))
        .map(f => ({
            id: `fixa-${f.id}-${competencia}`,
            usuarioId: f.usuarioId,
            usuarioNome: f.usuarioNome,
            valor: f.valor,
            categoria: f.categoria,
            formaPagamento: f.formaPagamento,
            cartaoId: f.cartaoId,
            despesaFixaId: f.id,
            descricao: f.descricao,
            parcelaAtual: null,
            parcelaTotal: null,
            parcelaGrupoId: null,
            dataDespesa: `${competencia}-01`,
            mensagemOriginal: f.descricao || "Despesa fixa ainda não lançada",
            confiancaIA: null,
            compartilhada: f.compartilhada,
            virtual: true
        }));
}

function despesasDaFatura(cartao, competencia) {
    const reais = APP.despesas.filter(d =>
        d.cartaoId === cartao.id && competenciaFatura(d.dataDespesa, diaCorteFatura(cartao)) === competencia
    );
    return [...reais, ...despesasFixasVirtuaisParaFatura(cartao, competencia)];
}

/** Mesma fatura, mas do ponto de vista de uma pessoa específica: só as
 *  despesas dela (valor cheio) mais a METADE de cada despesa marcada
 *  como "ambos" nessa fatura (a outra metade é da outra pessoa, mesmo
 *  a compra estando lançada nesse cartão). Sem usuarioId (visão
 *  "Total"), devolve a fatura inteira, valor cheio. Cada despesa vem
 *  com "valorExibido" já calculado pra essa visão. */
function despesasDaFaturaPorPessoa(cartao, competencia, usuarioId) {
    const todas = despesasDaFatura(cartao, competencia);
    if (!usuarioId) {
        return todas.map(d => ({ ...d, valorExibido: d.valor }));
    }
    return todas
        .filter(d => d.compartilhada || String(d.usuarioId) === String(usuarioId))
        .map(d => ({ ...d, valorExibido: d.compartilhada ? d.valor / 2 : d.valor }));
}

/** Todas as competências ("YYYY-MM") com gasto nesse cartão — passadas
 *  e futuras (parcelas já agendadas aparecem aqui mesmo antes de a
 *  fatura fechar) — mais a competência atual, mesmo sem gasto ainda. */
function competenciasDoCartao(cartao) {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const chaves = new Set(
        APP.despesas
            .filter(d => d.cartaoId === cartao.id)
            .map(d => competenciaFatura(d.dataDespesa, diaCorteFatura(cartao)))
    );
    chaves.add(competenciaFatura(hojeISO, diaCorteFatura(cartao)));
    return [...chaves].sort();
}

async function selecionarCartao(cartaoId) {
    cartaoSelecionadoId = cartaoId;
    const cartao = APP.cartoes.find(c => String(c.id) === String(cartaoId));
    if (!cartao) return;

    const hojeISO = new Date().toISOString().slice(0, 10);
    competenciaSelecionada = competenciaFatura(hojeISO, diaCorteFatura(cartao));
    pessoaFaturaSelecionada = APP.usuario.id;

    pagamentosFaturaCache = await buscarFaturaPagamentos(cartaoId);
    renderizarDetalheFatura();
}

function mudarCompetencia(delta) {
    if (!competenciaSelecionada) return;
    competenciaSelecionada = somarMesACompetencia(competenciaSelecionada, delta);
    renderizarDetalheFatura();
}

async function aoMarcarFaturaPaga() {
    const cartao = APP.cartoes.find(c => String(c.id) === String(cartaoSelecionadoId));
    if (!cartao) return;

    // Só as despesas reais entram no pagamento — as "previstas" (fixas
    // ainda não lançadas) só aparecem pra planejamento, não dá pra
    // pagar uma cobrança que ainda não existe de verdade.
    const lista = despesasDaFatura(cartao, competenciaSelecionada).filter(d => !d.virtual);
    const total = lista.reduce((soma, d) => soma + d.valor, 0);
    if (total <= 0) return;

    if (!confirm(`Marcar a fatura de ${rotuloCompetencia(competenciaSelecionada)} (${formatarMoeda(total)}) como paga? Isso vai descontar da carteira de ${cartao.usuarioNome}.`)) {
        return;
    }

    const botao = document.getElementById("btnMarcarFaturaPaga");
    botao.disabled = true;

    const ok = await marcarFaturaPaga({
        cartaoId: cartao.id,
        competencia: `${competenciaSelecionada}-01`,
        valorPago: total
    });

    botao.disabled = false;

    if (!ok) {
        alert("Não foi possível marcar a fatura como paga. Veja o console pra detalhes.");
        return;
    }

    pagamentosFaturaCache = await buscarFaturaPagamentos(cartao.id);
    APP.carteiras = await buscarCarteiras();
    renderizarDetalheFatura();
    renderizarCarteiras();
}

async function aoExcluirCartao(id) {
    if (!confirm("Excluir esse cartão? As despesas já lançadas nele continuam, só perdem o vínculo com o cartão.")) return;

    const ok = await excluirCartao(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    if (String(cartaoSelecionadoId) === String(id)) {
        cartaoSelecionadoId = null;
        document.getElementById("detalheFatura").innerHTML = "";
    }

    APP.cartoes = APP.cartoes.filter(c => String(c.id) !== String(id));
    renderizarCartoes();
    popularFormaPagamentoNovaDespesa();
}

function renderizarCartoes() {
    const container = document.getElementById("listaCartoes");
    if (!container) return;

    if (APP.cartoes.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum cartão cadastrado ainda.</p>';
        document.getElementById("detalheFatura").innerHTML = "";
        return;
    }

    container.innerHTML = APP.cartoes.map(c => {
        if (String(cartaoEditandoId) === String(c.id)) {
            return `
                <div class="stat-tile">
                    <div class="stat-label">${escaparHtml(c.nome)} · ${escaparHtml(c.usuarioNome)}</div>
                    <div class="filtros-linha" style="margin-top:8px">
                        <label>Fecha
                            <input type="number" min="1" max="31" class="input-cartao-fechamento" value="${c.diaFechamento}">
                        </label>
                        <label>Vence
                            <input type="number" min="1" max="31" class="input-cartao-vencimento" value="${c.diaVencimento ?? ""}" placeholder="opcional">
                        </label>
                    </div>
                    <div class="filtros-linha" style="margin-top:10px">
                        <button type="button" class="botao-primario botao-pequeno" data-salvar-cartao="${c.id}">Salvar</button>
                        <button type="button" class="botao-editar" data-cancelar-edicao-cartao title="Cancelar">✕</button>
                    </div>
                </div>
            `;
        }

        const hojeISO = new Date().toISOString().slice(0, 10);
        const competenciaAtual = competenciaFatura(hojeISO, diaCorteFatura(c));
        const total = despesasDaFatura(c, competenciaAtual).reduce((soma, d) => soma + d.valor, 0);
        return `
            <div class="stat-tile cartao-clicavel" data-cartao-id="${c.id}">
                <button type="button" class="botao-editar" data-editar-cartao-id="${c.id}" title="Editar fechamento/vencimento">✏️</button>
                <button type="button" class="botao-excluir" data-excluir-cartao-id="${c.id}" title="Excluir cartão">&times;</button>
                ${statIcone("💳", "azul")}
                <div class="stat-label">${escaparHtml(c.nome)} · ${escaparHtml(c.usuarioNome)}</div>
                <div class="stat-valor">${formatarMoeda(total)}</div>
                <div class="stat-sublinha">Fatura de ${rotuloCompetencia(competenciaAtual)} · ${c.diaVencimento ? `vence dia ${c.diaVencimento}` : `fecha dia ${c.diaFechamento}`}</div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-cartao-id]").forEach(el => {
        el.addEventListener("click", () => selecionarCartao(el.dataset.cartaoId));
    });

    container.querySelectorAll("[data-excluir-cartao-id]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            aoExcluirCartao(botao.dataset.excluirCartaoId);
        });
    });

    container.querySelectorAll("[data-editar-cartao-id]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            cartaoEditandoId = botao.dataset.editarCartaoId;
            renderizarCartoes();
        });
    });

    container.querySelectorAll("[data-cancelar-edicao-cartao]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            cartaoEditandoId = null;
            renderizarCartoes();
        });
    });

    container.querySelectorAll("[data-salvar-cartao]").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            aoSalvarEdicaoCartao(botao.dataset.salvarCartao);
        });
    });

    if (cartaoSelecionadoId && APP.cartoes.some(c => String(c.id) === String(cartaoSelecionadoId))) {
        renderizarDetalheFatura();
    }
}

async function aoSalvarEdicaoCartao(id) {
    const diaFechamento = Number(document.querySelector(".input-cartao-fechamento").value);
    const diaVencimento = Number(document.querySelector(".input-cartao-vencimento").value) || null;
    if (!diaFechamento) return;

    const ok = await atualizarCartao(id, { dia_fechamento: diaFechamento, dia_vencimento: diaVencimento });
    if (!ok) {
        alert("Não foi possível atualizar o cartão. Veja o console pra detalhes.");
        return;
    }

    cartaoEditandoId = null;
    APP.cartoes = await buscarCartoes();
    renderizarCartoes();
}

function renderizarDetalheFatura() {
    const container = document.getElementById("detalheFatura");
    if (!container) return;

    const cartao = APP.cartoes.find(c => String(c.id) === String(cartaoSelecionadoId));
    if (!cartao) {
        container.innerHTML = "";
        return;
    }

    const listaTotal = despesasDaFatura(cartao, competenciaSelecionada);
    const totalFatura = listaTotal.reduce((soma, d) => soma + d.valor, 0);
    const lista = despesasDaFaturaPorPessoa(cartao, competenciaSelecionada, pessoaFaturaSelecionada);
    const totalExibido = lista.reduce((soma, d) => soma + d.valorExibido, 0);
    const jaPaga = pagamentosFaturaCache.some(p => p.competencia.slice(0, 7) === competenciaSelecionada);
    const competencias = competenciasDoCartao(cartao);

    // Um botão por pessoa (as duas do casal) — cada um já mostra o
    // valor daquela visão nessa fatura: despesas dela (valor cheio) +
    // metade das compartilhadas ("ambos" divide entre as duas).
    const opcoesPessoa = APP.carteiras.map(c => ({
        id: c.usuarioId,
        nome: c.usuarioNome,
        valor: despesasDaFaturaPorPessoa(cartao, competenciaSelecionada, c.usuarioId).reduce((soma, d) => soma + d.valorExibido, 0)
    }));

    container.innerHTML = `
        <div class="cartao">
            <div class="filtros-linha">
                <button type="button" id="btnFaturaAnterior" class="botao-icone">‹</button>
                <h3>${escaparHtml(cartao.nome)} — Fatura de ${rotuloCompetencia(competenciaSelecionada)}</h3>
                <button type="button" id="btnFaturaProxima" class="botao-icone">›</button>
            </div>
            <div class="tira-competencias">
                ${competencias.map(comp => {
                    const totalComp = despesasDaFatura(cartao, comp).reduce((soma, d) => soma + d.valor, 0);
                    const pagaComp = pagamentosFaturaCache.some(p => p.competencia.slice(0, 7) === comp);
                    return `
                        <button type="button" class="pill-competencia${comp === competenciaSelecionada ? " pill-competencia-ativa" : ""}" data-competencia="${comp}">
                            <span class="pill-competencia-mes">${rotuloCompetencia(comp)}</span>
                            <span class="pill-competencia-valor">${formatarMoeda(totalComp)}</span>
                            ${pagaComp ? '<span class="pill-competencia-paga">✓ paga</span>' : ""}
                        </button>
                    `;
                }).join("")}
            </div>
            <div class="tira-competencias">
                ${opcoesPessoa.map(op => `
                    <button type="button" class="pill-competencia${op.id === pessoaFaturaSelecionada ? " pill-competencia-ativa" : ""}" data-pessoa-fatura="${op.id}">
                        <span class="pill-competencia-mes">${escaparHtml(op.nome)}</span>
                        <span class="pill-competencia-valor">${formatarMoeda(op.valor)}</span>
                    </button>
                `).join("")}
            </div>
            <div class="kpi-grid">
                <div class="stat-tile cartao-clicavel${!pessoaFaturaSelecionada ? " stat-tile-destaque" : ""}" data-selecionar-total>
                    ${statIcone("🧾", "azul")}
                    <div class="stat-label">Total da fatura</div>
                    <div class="stat-valor">${formatarMoeda(totalFatura)}</div>
                    <div class="stat-sublinha">${jaPaga ? "✅ Paga" : "Em aberto"} · clique pra ver os dois juntos</div>
                </div>
                ${pessoaFaturaSelecionada ? `
                <div class="stat-tile">
                    ${statIconePessoa(opcoesPessoa.find(op => op.id === pessoaFaturaSelecionada)?.nome ?? "", opcoesPessoa.findIndex(op => op.id === pessoaFaturaSelecionada))}
                    <div class="stat-label">Fatura de ${escaparHtml(opcoesPessoa.find(op => op.id === pessoaFaturaSelecionada)?.nome ?? "")}</div>
                    <div class="stat-valor">${formatarMoeda(totalExibido)}</div>
                </div>
                ` : ""}
            </div>
            ${lista.length === 0
                ? '<p class="alerta-vazio">Nenhum gasto nessa fatura.</p>'
                : `<table class="tabela-despesas">
                    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Pessoa</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${lista.map(d => `
                            <tr${d.virtual ? ' class="linha-despesa-virtual" title="Despesa fixa ainda não lançada — entra de verdade no 5º dia útil do mês"' : ""}>
                                <td>${d.virtual ? "—" : formatarDataBR(d.dataDespesa)}</td>
                                <td>${escaparHtml(d.descricao || d.mensagemOriginal)}${d.parcelaTotal ? ` <span class="badge-parcela">${d.parcelaAtual}/${d.parcelaTotal}</span>` : ""}${d.compartilhada ? ' <span class="badge-parcela">ambos</span>' : ""}${d.virtual ? ' <span class="badge-parcela">prevista</span>' : ""}</td>
                                <td>${escaparHtml(d.categoria)}</td>
                                <td>${escaparHtml(d.compartilhada ? "Ambos" : d.usuarioNome)}</td>
                                <td class="valor-cell">${formatarMoeda(d.valorExibido)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                   </table>`
            }
            ${!jaPaga && totalFatura > 0 ? '<button type="button" id="btnMarcarFaturaPaga" class="botao-primario">Marcar fatura como paga</button>' : ""}
        </div>
    `;

    const btnAnterior = document.getElementById("btnFaturaAnterior");
    const btnProxima = document.getElementById("btnFaturaProxima");
    const btnMarcarPaga = document.getElementById("btnMarcarFaturaPaga");
    if (btnAnterior) btnAnterior.addEventListener("click", () => mudarCompetencia(-1));
    if (btnProxima) btnProxima.addEventListener("click", () => mudarCompetencia(1));
    if (btnMarcarPaga) btnMarcarPaga.addEventListener("click", aoMarcarFaturaPaga);

    container.querySelectorAll("[data-competencia]").forEach(pill => {
        pill.addEventListener("click", () => {
            competenciaSelecionada = pill.dataset.competencia;
            renderizarDetalheFatura();
        });
    });

    container.querySelectorAll("[data-pessoa-fatura]").forEach(pill => {
        pill.addEventListener("click", () => {
            pessoaFaturaSelecionada = pill.dataset.pessoaFatura || null;
            renderizarDetalheFatura();
        });
    });

    container.querySelectorAll("[data-selecionar-total]").forEach(tile => {
        tile.addEventListener("click", () => {
            pessoaFaturaSelecionada = null;
            renderizarDetalheFatura();
        });
    });

    const pillAtiva = container.querySelector(".pill-competencia-ativa");
    if (pillAtiva) pillAtiva.scrollIntoView({ inline: "center", block: "nearest" });
}
