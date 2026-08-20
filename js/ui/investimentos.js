/**
 * ==========================================================
 * UI de Investimentos
 * ==========================================================
 * Registro acontece pela mesma caixa de texto da aba Despesas (a IA
 * classifica) — aqui só renderiza o total e a lista, e permite excluir.
 */

function registrarInvestimentos() {
    // Sem formulário próprio — o registro é feito pela caixa de texto
    // compartilhada em js/ui/dashboard.js (aoRegistrarDespesa).
}

function renderizarInvestimentos() {
    renderizarKpisInvestimentos();
    renderizarListaInvestimentos();
}

function renderizarKpisInvestimentos() {
    const container = document.getElementById("kpisInvestimentos");
    if (!container) return;

    const total = APP.investimentos.reduce((soma, i) => soma + i.valor, 0);

    const porPessoa = new Map();
    for (const i of APP.investimentos) porPessoa.set(i.usuarioNome, (porPessoa.get(i.usuarioNome) ?? 0) + i.valor);

    container.innerHTML = `
        <div class="stat-tile">
            <div class="stat-label">Total investido</div>
            <div class="stat-valor">${formatarMoeda(total)}</div>
        </div>
        ${[...porPessoa.entries()].map(([nome, valor]) => `
            <div class="stat-tile">
                <div class="stat-label">Investido por ${escaparHtml(nome)}</div>
                <div class="stat-valor">${formatarMoeda(valor)}</div>
            </div>
        `).join("")}
    `;
}

function renderizarListaInvestimentos() {
    const container = document.getElementById("listaInvestimentos");
    if (!container) return;

    if (APP.investimentos.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum investimento registrado ainda.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-despesas">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Conta</th>
                    <th>Pessoa</th>
                    <th>Valor</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${APP.investimentos.map(i => `
                    <tr>
                        <td>${formatarDataBR(i.dataInvestimento)}</td>
                        <td title="${escaparHtml(i.mensagemOriginal)}">${escaparHtml(i.descricao || i.mensagemOriginal)}</td>
                        <td>${escaparHtml(i.conta || "-")}</td>
                        <td>${escaparHtml(i.usuarioNome)}</td>
                        <td class="valor-cell">${formatarMoeda(i.valor)}</td>
                        <td><button type="button" class="botao-excluir" data-id="${i.id}" title="Excluir">&times;</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirInvestimento(botao.dataset.id));
    });
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
}
