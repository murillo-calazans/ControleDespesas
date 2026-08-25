/**
 * ==========================================================
 * UI de Resumo
 * ==========================================================
 * Visão geral do casal: saldo total das carteiras, saldo por pessoa,
 * gasto do mês atual, compromisso fixo mensal e total investido. Só
 * lê de APP (já carregado pelas outras abas em inicializarDadosAutenticado)
 * — sem fetch próprio, sem formulário.
 */

function renderizarResumo() {
    const container = document.getElementById("kpisResumo");
    if (!container) return;

    const saldoTotal = APP.carteiras.reduce((soma, c) => soma + c.saldo, 0);

    const mesAtualChave = new Date().toISOString().slice(0, 7);
    const gastoMes = APP.despesas
        .filter(d => d.dataDespesa.slice(0, 7) === mesAtualChave)
        .reduce((soma, d) => soma + d.valor, 0);

    const totalFixas = APP.despesasFixas.filter(f => f.ativa).reduce((soma, f) => soma + f.valor, 0);
    const totalInvestido = APP.investimentos.reduce((soma, i) => soma + i.valor, 0);

    container.innerHTML = `
        <div class="stat-tile stat-tile-destaque">
            ${statIcone("💰", "verde")}
            <div class="stat-label">Saldo total</div>
            <div class="stat-valor">${formatarMoeda(saldoTotal)}</div>
        </div>
        ${APP.carteiras.map((c, indice) => `
            <div class="stat-tile">
                ${statIconePessoa(c.usuarioNome, indice)}
                <div class="stat-label">Saldo de ${escaparHtml(c.usuarioNome)}</div>
                <div class="stat-valor">${formatarMoeda(c.saldo)}</div>
            </div>
        `).join("")}
        <div class="stat-tile">
            ${statIcone("🧾", "azul")}
            <div class="stat-label">Gasto de ${rotuloMes(mesAtualChave)}</div>
            <div class="stat-valor">${formatarMoeda(gastoMes)}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🔁", "laranja")}
            <div class="stat-label">Compromisso fixo mensal</div>
            <div class="stat-valor">${formatarMoeda(totalFixas)}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("📊", "roxo")}
            <div class="stat-label">Total investido</div>
            <div class="stat-valor">${formatarMoeda(totalInvestido)}</div>
        </div>
    `;
}
