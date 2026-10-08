/**
 * ==========================================================
 * UI da aba Casal
 * ==========================================================
 * Único lugar com a visão conjunta — todas as outras abas mostram só
 * quem está logado (ver js/core/pessoa.js). Tudo no mês global
 * (js/ui/mesGlobal.js): saldo e gasto do casal, comparação lado a lado
 * de cada um (gasto = próprias + metade das "Ambos", mesma regra do
 * trigger de saldo no banco) e a lista das despesas compartilhadas.
 *
 * Só lê de APP, sem fetch próprio. Renderiza ao abrir a aba (ver
 * selecionarAba em js/ui/abas.js) e ao trocar de mês — assim sempre
 * pega os dados mais recentes sem cada ação das outras abas precisar
 * lembrar de chamar essa.
 */

/** Parte de uma pessoa numa despesa: cheia se é dela, metade se "Ambos". */
function partePessoa(despesa, usuarioId) {
    if (despesa.compartilhada) return despesa.valor / 2;
    return String(despesa.usuarioId) === String(usuarioId) ? despesa.valor : 0;
}

function renderizarCasal() {
    const kpis = document.getElementById("kpisCasal");
    const comparativo = document.getElementById("comparativoCasal");
    const lista = document.getElementById("listaCompartilhadas");
    if (!kpis || !comparativo || !lista) return;

    const despesasMes = gastosDoMes(APP.mesGlobal);
    const compartilhadas = despesasMes
        .filter(d => d.compartilhada)
        .sort((a, b) => b.dataDespesa.localeCompare(a.dataDespesa));

    const saldoCasal = APP.carteiras.reduce((soma, c) => soma + c.saldo, 0);
    const gastoCasal = despesasMes.reduce((soma, d) => soma + d.valor, 0);
    const totalConjunto = compartilhadas.reduce((soma, d) => soma + d.valor, 0);

    kpis.innerHTML = `
        <div class="stat-tile stat-tile-destaque">
            ${statIcone("💰", "verde")}
            <div class="stat-label">Saldo do casal</div>
            <div class="stat-valor">${formatarMoeda(saldoCasal)}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🧾", "azul")}
            <div class="stat-label">Gasto do casal em ${rotuloMes(APP.mesGlobal)}</div>
            <div class="stat-valor">${formatarMoeda(gastoCasal)}</div>
            <div class="stat-sublinha">Tudo dos dois no mês, com as fixas previstas</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🤝", "roxo")}
            <div class="stat-label">Gasto em conjunto</div>
            <div class="stat-valor">${formatarMoeda(totalConjunto)}</div>
            <div class="stat-sublinha">Despesas "Ambos", valor cheio · ${formatarMoeda(totalConjunto / 2)} de cada</div>
        </div>
    `;

    const linhas = APP.carteiras.map((c, indice) => {
        const gasto = despesasMes.reduce((soma, d) => soma + partePessoa(d, c.usuarioId), 0);
        const fixas = APP.despesasFixas
            .filter(f => f.ativa)
            .reduce((soma, f) => soma + partePessoa(f, c.usuarioId), 0);
        const investido = APP.investimentos
            .filter(i => String(i.usuarioId) === String(c.usuarioId) && i.dataInvestimento.slice(0, 7) <= APP.mesGlobal)
            .reduce((soma, i) => soma + i.valor, 0);
        return { carteira: c, indice, gasto, fixas, investido };
    });

    comparativo.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-despesas">
                <thead>
                    <tr>
                        <th></th>
                        ${linhas.map(l => `<th>${escaparHtml(l.carteira.usuarioNome)}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Saldo</td>${linhas.map(l => `<td class="valor-cell">${formatarMoeda(l.carteira.saldo)}</td>`).join("")}</tr>
                    <tr><td>Gasto em ${rotuloMes(APP.mesGlobal)}</td>${linhas.map(l => `<td class="valor-cell">${formatarMoeda(l.gasto)}</td>`).join("")}</tr>
                    <tr><td>Fixas por mês</td>${linhas.map(l => `<td class="valor-cell">${formatarMoeda(l.fixas)}</td>`).join("")}</tr>
                    <tr><td>Investido (acumulado)</td>${linhas.map(l => `<td class="valor-cell">${formatarMoeda(l.investido)}</td>`).join("")}</tr>
                </tbody>
            </table>
        </div>
        <p class="descricao-campo">Gasto de cada um = despesas próprias + metade das "Ambos".</p>
    `;

    if (compartilhadas.length === 0) {
        lista.innerHTML = '<p class="alerta-vazio">Nenhuma despesa "Ambos" nesse mês.</p>';
        return;
    }

    lista.innerHTML = `
        <div class="tabela-scroll">
            <table class="tabela-despesas">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Lançado por</th>
                        <th>Total</th>
                        <th>Cada um</th>
                    </tr>
                </thead>
                <tbody>
                    ${compartilhadas.map(d => `
                        <tr class="${d.virtual ? "linha-despesa-virtual" : classeLinhaBancoDespesa(d)}">
                            <td>${d.virtual ? "—" : formatarDataBR(d.dataDespesa)}</td>
                            <td>${escaparHtml(d.descricao || d.mensagemOriginal)}${d.parcelaTotal ? ` <span class="badge-parcela">${d.parcelaAtual}/${d.parcelaTotal}</span>` : ""}${d.virtual ? ' <span class="badge-parcela">prevista</span>' : ""}</td>
                            <td>${escaparHtml(d.categoria)}</td>
                            <td>${escaparHtml(d.usuarioNome)}</td>
                            <td class="valor-cell">${formatarMoeda(d.valor)}</td>
                            <td class="valor-cell">${formatarMoeda(d.valor / 2)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}
