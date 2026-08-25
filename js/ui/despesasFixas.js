/**
 * ==========================================================
 * UI de Despesas Fixas
 * ==========================================================
 * O template é criado automaticamente pela IA quando detecta um gasto
 * recorrente (aba Despesas) e lançado todo mês sozinho via pg_cron
 * no banco. Aqui só mostra a lista, permite pausar/reativar/excluir,
 * e calcula uma projeção simples de gastos do mês.
 */

function registrarDespesasFixas() {
    // Sem formulário de criação — despesas fixas nascem da IA (ver
    // supabase/functions/parse-despesa/index.ts). Ações da lista são
    // ligadas a cada renderização (renderizarListaDespesasFixas).
}

/** Projeção do mês: soma das fixas ativas + média das despesas
 *  variáveis (sem despesa_fixa_id) dos últimos 3 meses fechados. */
function calcularProjecaoMensal() {
    const totalFixas = APP.despesasFixas.filter(f => f.ativa).reduce((soma, f) => soma + f.valor, 0);
    const mediaVariaveis = mediaGastosVariaveisUltimosMeses(3);
    return totalFixas + mediaVariaveis;
}

function mediaGastosVariaveisUltimosMeses(qtdMeses) {
    const hoje = new Date();
    const mesAtualChave = hoje.toISOString().slice(0, 7);

    const mesesAlvo = [];
    for (let i = 1; i <= qtdMeses; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        mesesAlvo.push(d.toISOString().slice(0, 7));
    }

    const variaveis = APP.despesas.filter(d => !d.despesaFixaId && d.dataDespesa.slice(0, 7) !== mesAtualChave);

    const porMes = new Map();
    for (const d of variaveis) {
        if (!mesesAlvo.includes(d.dataDespesa.slice(0, 7))) continue;
        porMes.set(d.dataDespesa.slice(0, 7), (porMes.get(d.dataDespesa.slice(0, 7)) ?? 0) + d.valor);
    }

    if (porMes.size === 0) return 0;
    const total = [...porMes.values()].reduce((soma, v) => soma + v, 0);
    return total / porMes.size;
}

function renderizarDespesasFixas() {
    renderizarKpisFixas();
    renderizarListaDespesasFixas();
}

function renderizarKpisFixas() {
    const container = document.getElementById("kpisFixas");
    if (!container) return;

    const totalFixas = APP.despesasFixas.filter(f => f.ativa).reduce((soma, f) => soma + f.valor, 0);
    const projecao = calcularProjecaoMensal();

    container.innerHTML = `
        <div class="stat-tile">
            <div class="stat-label">Total em gastos fixos</div>
            <div class="stat-valor">${formatarMoeda(totalFixas)}</div>
        </div>
        <div class="stat-tile">
            <div class="stat-label">Projeção do mês</div>
            <div class="stat-valor">${formatarMoeda(projecao)}</div>
            <div class="stat-sublinha">fixos + média das variáveis dos últimos meses</div>
        </div>
        <div class="stat-tile">
            <div class="stat-label">Lançamento automático</div>
            <div class="stat-valor">5º dia útil</div>
            <div class="stat-sublinha">dia do salário, todo mês</div>
        </div>
    `;
}

function renderizarListaDespesasFixas() {
    const container = document.getElementById("listaDespesasFixas");
    if (!container) return;

    if (APP.despesasFixas.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma despesa fixa ainda — diga algo como "Aluguel 1500 fixo" na aba Despesas.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-despesas">
            <thead>
                <tr>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${APP.despesasFixas.map(f => `
                    <tr>
                        <td>${escaparHtml(f.descricao || "-")}</td>
                        <td>${escaparHtml(f.categoria)}</td>
                        <td class="valor-cell">${formatarMoeda(f.valor)}</td>
                        <td>
                            <button type="button" class="botao-icone" data-toggle-id="${f.id}" data-ativa="${f.ativa}">
                                ${f.ativa ? "⏸️ Pausar" : "▶️ Reativar"}
                            </button>
                        </td>
                        <td><button type="button" class="botao-excluir" data-id="${f.id}" title="Excluir">&times;</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("[data-toggle-id]").forEach(botao => {
        botao.addEventListener("click", () => aoAlternarDespesaFixa(botao.dataset.toggleId, botao.dataset.ativa === "true"));
    });

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirDespesaFixa(botao.dataset.id));
    });
}

async function aoAlternarDespesaFixa(id, ativaAtual) {
    const ok = await atualizarDespesaFixa(id, { ativa: !ativaAtual });
    if (!ok) {
        alert("Não foi possível atualizar. Veja o console pra detalhes.");
        return;
    }

    APP.despesasFixas = await buscarDespesasFixas();
    renderizarDespesasFixas();
    renderizarResumo();
}

async function aoExcluirDespesaFixa(id) {
    if (!confirm("Excluir essa despesa fixa? Os lançamentos já feitos continuam na lista de despesas.")) return;

    const ok = await excluirDespesaFixa(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    APP.despesasFixas = APP.despesasFixas.filter(f => String(f.id) !== String(id));
    renderizarDespesasFixas();
    renderizarResumo();
}
