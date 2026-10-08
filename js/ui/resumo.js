/**
 * ==========================================================
 * UI de Resumo
 * ==========================================================
 * Visão de quem está logado: saldo total do casal + o próprio saldo, e
 * a SUA parte (ver minhaParte em js/core/pessoa.js) do gasto do mês global
 * (js/ui/mesGlobal.js), do compromisso fixo e do investido. Só
 * lê de APP (já carregado pelas outras abas em inicializarDadosAutenticado)
 * — sem fetch próprio, sem formulário.
 */

function renderizarResumo() {
    const container = document.getElementById("kpisResumo");
    if (!container) return;

    const saldoTotal = APP.carteiras.reduce((soma, c) => soma + c.saldo, 0);
    // Só a carteira de quem está logado — a do parceiro fica pra aba Casal.
    const carteira = minhaCarteira();

    const gastoMes = gastosDoMes(APP.mesGlobal).reduce((soma, d) => soma + minhaParte(d), 0);

    const totalFixas = APP.despesasFixas.filter(f => f.ativa).reduce((soma, f) => soma + minhaParte(f), 0);
    // Mesmo critério da aba Investimentos: acumulado até o mês global.
    const totalInvestido = APP.investimentos
        .filter(i => ehMeu(i) && i.dataInvestimento.slice(0, 7) <= APP.mesGlobal)
        .reduce((soma, i) => soma + i.valor, 0);

    container.innerHTML = `
        <div class="stat-tile stat-tile-destaque">
            ${statIcone("💰", "verde")}
            <div class="stat-label">Saldo total</div>
            <div class="stat-valor">${formatarMoeda(saldoTotal)}</div>
        </div>
        ${carteira ? `
            <div class="stat-tile">
                ${statIconePessoa(carteira.usuarioNome, APP.carteiras.indexOf(carteira))}
                <div class="stat-label">Meu saldo</div>
                <div class="stat-valor">${formatarMoeda(carteira.saldo)}</div>
            </div>
        ` : ""}
        <div class="stat-tile">
            ${statIcone("🧾", "azul")}
            <div class="stat-label">Meu gasto em ${rotuloMes(APP.mesGlobal)}</div>
            <div class="stat-valor">${formatarMoeda(gastoMes)}</div>
            <div class="stat-sublinha">Com metade das "Ambos" e as fixas previstas</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🔁", "laranja")}
            <div class="stat-label">Meu compromisso fixo</div>
            <div class="stat-valor">${formatarMoeda(totalFixas)}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("📊", "roxo")}
            <div class="stat-label">Meu total investido</div>
            <div class="stat-valor">${formatarMoeda(totalInvestido)}</div>
        </div>
    `;
}
