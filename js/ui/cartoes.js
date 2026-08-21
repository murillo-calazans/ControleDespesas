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
}

/** "YYYY-MM" da fatura em que uma despesa cai, dado o dia de fechamento do cartão. */
function competenciaFatura(dataISO, diaFechamento) {
    let [ano, mes, dia] = dataISO.split("-").map(Number);
    if (dia > diaFechamento) {
        mes += 1;
        if (mes > 12) { mes = 1; ano += 1; }
    }
    return `${ano}-${String(mes).padStart(2, "0")}`;
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

function despesasDaFatura(cartao, competencia) {
    return APP.despesas.filter(d =>
        d.cartaoId === cartao.id && competenciaFatura(d.dataDespesa, cartao.diaFechamento) === competencia
    );
}

/** Todas as competências ("YYYY-MM") com gasto nesse cartão — passadas
 *  e futuras (parcelas já agendadas aparecem aqui mesmo antes de a
 *  fatura fechar) — mais a competência atual, mesmo sem gasto ainda. */
function competenciasDoCartao(cartao) {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const chaves = new Set(
        APP.despesas
            .filter(d => d.cartaoId === cartao.id)
            .map(d => competenciaFatura(d.dataDespesa, cartao.diaFechamento))
    );
    chaves.add(competenciaFatura(hojeISO, cartao.diaFechamento));
    return [...chaves].sort();
}

async function selecionarCartao(cartaoId) {
    cartaoSelecionadoId = cartaoId;
    const cartao = APP.cartoes.find(c => String(c.id) === String(cartaoId));
    if (!cartao) return;

    const hojeISO = new Date().toISOString().slice(0, 10);
    competenciaSelecionada = competenciaFatura(hojeISO, cartao.diaFechamento);

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

    const lista = despesasDaFatura(cartao, competenciaSelecionada);
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
        const hojeISO = new Date().toISOString().slice(0, 10);
        const competenciaAtual = competenciaFatura(hojeISO, c.diaFechamento);
        const total = despesasDaFatura(c, competenciaAtual).reduce((soma, d) => soma + d.valor, 0);
        return `
            <div class="stat-tile cartao-clicavel" data-cartao-id="${c.id}">
                <button type="button" class="botao-excluir" data-excluir-cartao-id="${c.id}" title="Excluir cartão">&times;</button>
                <div class="stat-label">${escaparHtml(c.nome)} · ${escaparHtml(c.usuarioNome)}</div>
                <div class="stat-valor">${formatarMoeda(total)}</div>
                <div class="stat-sublinha">Fatura de ${rotuloCompetencia(competenciaAtual)} · fecha dia ${c.diaFechamento}</div>
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

    if (cartaoSelecionadoId && APP.cartoes.some(c => String(c.id) === String(cartaoSelecionadoId))) {
        renderizarDetalheFatura();
    }
}

function renderizarDetalheFatura() {
    const container = document.getElementById("detalheFatura");
    if (!container) return;

    const cartao = APP.cartoes.find(c => String(c.id) === String(cartaoSelecionadoId));
    if (!cartao) {
        container.innerHTML = "";
        return;
    }

    const lista = despesasDaFatura(cartao, competenciaSelecionada);
    const total = lista.reduce((soma, d) => soma + d.valor, 0);
    const jaPaga = pagamentosFaturaCache.some(p => p.competencia.slice(0, 7) === competenciaSelecionada);
    const competencias = competenciasDoCartao(cartao);

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
            <div class="kpi-grid">
                <div class="stat-tile">
                    <div class="stat-label">Total da fatura</div>
                    <div class="stat-valor">${formatarMoeda(total)}</div>
                    <div class="stat-sublinha">${jaPaga ? "✅ Paga" : "Em aberto"}</div>
                </div>
            </div>
            ${lista.length === 0
                ? '<p class="alerta-vazio">Nenhum gasto nessa fatura.</p>'
                : `<table class="tabela-despesas">
                    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${lista.map(d => `
                            <tr>
                                <td>${formatarDataBR(d.dataDespesa)}</td>
                                <td>${escaparHtml(d.descricao || d.mensagemOriginal)}${d.parcelaTotal ? ` <span class="badge-parcela">${d.parcelaAtual}/${d.parcelaTotal}</span>` : ""}</td>
                                <td>${escaparHtml(d.categoria)}</td>
                                <td class="valor-cell">${formatarMoeda(d.valor)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                   </table>`
            }
            ${!jaPaga && total > 0 ? '<button type="button" id="btnMarcarFaturaPaga" class="botao-primario">Marcar fatura como paga</button>' : ""}
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

    const pillAtiva = container.querySelector(".pill-competencia-ativa");
    if (pillAtiva) pillAtiva.scrollIntoView({ inline: "center", block: "nearest" });
}
