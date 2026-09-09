/**
 * ==========================================================
 * UI de Investimentos
 * ==========================================================
 * Registro acontece pela mesma caixa de texto da aba Despesas (a IA
 * classifica) — aqui renderiza o total, a lista, permite excluir e
 * configurar manualmente uma taxa de rendimento por investimento (ver
 * database/schema-investimentos-taxa-juros.sql).
 */

let filtroMesInvestimentos = null; // "YYYY-MM" ou null (todos os meses)

function registrarInvestimentos() {
    // Sem formulário próprio — o registro é feito pela caixa de texto
    // compartilhada em js/ui/dashboard.js (aoRegistrarDespesa).

    const filtroMes = document.getElementById("filtroMesInvestimentos");
    if (filtroMes) filtroMes.addEventListener("change", () => {
        filtroMesInvestimentos = filtroMes.value || null;
        renderizarListaInvestimentos();
    });
}

/** Normaliza a taxa configurada (mensal ou anual) pra um equivalente
 *  mensal via juros compostos — assim dá pra somar/comparar
 *  investimentos com período diferente num "rendimento estimado" só.
 *  null se o investimento não tem taxa configurada. */
function taxaMensalEquivalente(investimento) {
    if (investimento.taxaJuros == null || !investimento.periodoTaxa) return null;
    if (investimento.periodoTaxa === "mensal") return investimento.taxaJuros;
    return (Math.pow(1 + investimento.taxaJuros / 100, 1 / 12) - 1) * 100;
}

/** Rendimento estimado pro próximo mês, em R$ — null sem taxa configurada. */
function rendimentoMensalEstimado(investimento) {
    const taxaMensal = taxaMensalEquivalente(investimento);
    return taxaMensal === null ? null : investimento.valor * (taxaMensal / 100);
}

function renderizarInvestimentos() {
    renderizarKpisInvestimentos();
    popularFiltroMesInvestimentos();
    renderizarListaInvestimentos();
}

function popularFiltroMesInvestimentos() {
    const select = document.getElementById("filtroMesInvestimentos");
    if (!select) return;

    const meses = [...new Set(APP.investimentos.map(i => i.dataInvestimento.slice(0, 7)))].sort().reverse();
    select.innerHTML = '<option value="">Todos os meses</option>' +
        meses.map(m => `<option value="${m}">${rotuloMes(m)}</option>`).join("");
    select.value = filtroMesInvestimentos || "";
}

function renderizarKpisInvestimentos() {
    const container = document.getElementById("kpisInvestimentos");
    if (!container) return;

    const lista = filtroMesInvestimentos
        ? APP.investimentos.filter(i => i.dataInvestimento.slice(0, 7) === filtroMesInvestimentos)
        : APP.investimentos;

    const total = lista.reduce((soma, i) => soma + i.valor, 0);

    const rendimentoMensal = lista.reduce((soma, i) => soma + (rendimentoMensalEstimado(i) ?? 0), 0);
    const temAlgumaTaxa = lista.some(i => rendimentoMensalEstimado(i) !== null);

    const porPessoa = new Map();
    for (const i of lista) porPessoa.set(i.usuarioNome, (porPessoa.get(i.usuarioNome) ?? 0) + i.valor);

    container.innerHTML = `
        <div class="stat-tile">
            ${statIcone("📊", "verde")}
            <div class="stat-label">Total investido</div>
            <div class="stat-valor">${formatarMoeda(total)}</div>
        </div>
        ${temAlgumaTaxa ? `
        <div class="stat-tile">
            ${statIcone("📈", "azul")}
            <div class="stat-label">Rendimento estimado (mês)</div>
            <div class="stat-valor">${formatarMoeda(rendimentoMensal)}</div>
            <div class="stat-sublinha">Só dos investimentos com taxa configurada</div>
        </div>
        ` : ""}
        ${[...porPessoa.entries()].map(([nome, valor], indice) => `
            <div class="stat-tile">
                ${statIconePessoa(nome, indice)}
                <div class="stat-label">Investido por ${escaparHtml(nome)}</div>
                <div class="stat-valor">${formatarMoeda(valor)}</div>
            </div>
        `).join("")}
    `;
}

function renderizarListaInvestimentos() {
    const container = document.getElementById("listaInvestimentos");
    if (!container) return;

    const lista = filtroMesInvestimentos
        ? APP.investimentos.filter(i => i.dataInvestimento.slice(0, 7) === filtroMesInvestimentos)
        : APP.investimentos;

    if (lista.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum investimento encontrado.</p>';
        return;
    }

    container.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-despesas">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Conta</th>
                        <th>Pessoa</th>
                        <th>Valor</th>
                        <th>Taxa</th>
                        <th>Rendimento/mês</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(i => `
                        <tr>
                            <td>${formatarDataBR(i.dataInvestimento)}</td>
                            <td title="${escaparHtml(i.mensagemOriginal)}">${escaparHtml(i.descricao || i.mensagemOriginal)}</td>
                            <td>${escaparHtml(i.conta || "-")}</td>
                            <td>${escaparHtml(i.usuarioNome)}</td>
                            <td class="valor-cell">${formatarMoeda(i.valor)}</td>
                            <td>
                                <div class="celula-taxa-juros">
                                    <input type="number" step="0.01" min="0" class="input-taxa-linha" data-id-investimento="${i.id}" value="${i.taxaJuros ?? ""}" placeholder="0,00">
                                    <select class="select-periodo-taxa-linha" data-id-investimento="${i.id}">
                                        <option value="mensal"${i.periodoTaxa !== "anual" ? " selected" : ""}>% ao mês</option>
                                        <option value="anual"${i.periodoTaxa === "anual" ? " selected" : ""}>% ao ano</option>
                                    </select>
                                </div>
                            </td>
                            <td class="valor-cell">${rendimentoMensalEstimado(i) === null ? "-" : formatarMoeda(rendimentoMensalEstimado(i))}</td>
                            <td><button type="button" class="botao-excluir" data-id="${i.id}" title="Excluir">&times;</button></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirInvestimento(botao.dataset.id));
    });

    container.querySelectorAll(".input-taxa-linha").forEach(input => {
        input.addEventListener("change", () => aoAlterarTaxaJurosInvestimento(input.dataset.idInvestimento));
    });

    container.querySelectorAll(".select-periodo-taxa-linha").forEach(select => {
        select.addEventListener("change", () => aoAlterarTaxaJurosInvestimento(select.dataset.idInvestimento));
    });
}

async function aoAlterarTaxaJurosInvestimento(id) {
    const input = document.querySelector(`.input-taxa-linha[data-id-investimento="${id}"]`);
    const select = document.querySelector(`.select-periodo-taxa-linha[data-id-investimento="${id}"]`);
    if (!input || !select) return;

    const valorDigitado = input.value.trim();
    const taxaJuros = valorDigitado === "" ? null : Number(valorDigitado);
    const periodoTaxa = taxaJuros === null ? null : select.value;

    if (taxaJuros !== null && (Number.isNaN(taxaJuros) || taxaJuros < 0)) {
        alert("Taxa inválida.");
        renderizarListaInvestimentos();
        return;
    }

    const ok = await atualizarTaxaJurosInvestimento(id, taxaJuros, periodoTaxa);
    if (!ok) {
        alert("Não foi possível salvar a taxa. Veja o console pra detalhes.");
        return;
    }

    APP.investimentos = await buscarInvestimentos();
    renderizarInvestimentos();
}

async function aoExcluirInvestimento(id) {
    if (!confirm("Excluir esse investimento?")) return;

    const ok = await excluirInvestimento(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    APP.investimentos = APP.investimentos.filter(i => String(i.id) !== String(id));
    APP.carteiras = await buscarCarteiras();
    renderizarInvestimentos();
    renderizarCarteiras();
    renderizarResumo();
}
