/**
 * ==========================================================
 * UI do Dashboard
 * ==========================================================
 * Campo de texto livre (chama a IA via registrarDespesa), filtros
 * (mês/pessoa/categoria), KPIs e a tabela de despesas. Não calcula
 * nada de "verdade" aqui além de somas simples — os dados já vêm
 * prontos de js/services/despesas.js.
 */

// Mesma lista da tabela despesas (database/schema-supabase.sql) e da
// Edge Function parse-despesa — usada só pro filtro de categoria.
const CATEGORIAS = [
    "Alimentação", "Mercado", "Transporte", "Saúde", "Lazer",
    "Casa", "Educação", "Assinaturas", "Compras", "Outros"
];

function registrarDashboard() {
    const form = document.getElementById("formNovaDespesa");
    if (form) form.addEventListener("submit", aoRegistrarDespesa);

    const filtroMes = document.getElementById("filtroMes");
    const filtroPessoa = document.getElementById("filtroPessoa");
    const filtroCategoria = document.getElementById("filtroCategoria");

    if (filtroMes) filtroMes.addEventListener("change", aoMudarFiltro);
    if (filtroPessoa) filtroPessoa.addEventListener("change", aoMudarFiltro);
    if (filtroCategoria) filtroCategoria.addEventListener("change", aoMudarFiltro);
}

function aoMudarFiltro() {
    APP.filtros.mes = document.getElementById("filtroMes").value || null;
    APP.filtros.usuarioId = document.getElementById("filtroPessoa").value || null;
    APP.filtros.categoria = document.getElementById("filtroCategoria").value || null;
    renderizarDashboard();
}

async function aoRegistrarDespesa(evento) {
    evento.preventDefault();

    const input = document.getElementById("inputTextoDespesa");
    const botao = document.getElementById("btnRegistrarDespesa");
    const resultado = document.getElementById("resultadoRegistro");

    const texto = input.value.trim();
    if (!texto) return;

    const pessoaAlvo = document.getElementById("inputPessoaDespesa")?.value || null;

    botao.disabled = true;
    resultado.hidden = true;

    const resposta = await registrarDespesa(texto, pessoaAlvo);

    botao.disabled = false;

    if (!resposta.ok) {
        mostrarResultadoRegistro(`❌ ${resposta.mensagem}`, "erro");
        return;
    }

    if (resposta.tipo === "nenhum" || !resposta.registrado) {
        mostrarResultadoRegistro("🤔 Não entendi isso como um gasto ou investimento — tenta reformular?", "aviso");
        return;
    }

    if (resposta.tipo === "investimento") {
        const inv = resposta.investimento;
        const notaDivisaoInv = resposta.dividido ? ` (${formatarMoeda(resposta.valorTotal)} no total, dividido)` : "";
        mostrarResultadoRegistro(
            `💹 Investimento registrado: ${formatarMoeda(inv.valor)}${notaDivisaoInv}${inv.conta ? ` — ${inv.conta}` : ""}`,
            "sucesso"
        );
        input.value = "";
        APP.investimentos = await buscarInvestimentos();
        APP.carteiras = await buscarCarteiras();
        renderizarInvestimentos();
        renderizarCarteiras();
        renderizarResumo();
        return;
    }

    const d = resposta.despesa;
    const alerta = d.confianca_ia === "baixa" || d.confianca_ia === "media" ? "⚠️ Não tenho certeza — confere: " : "✅ Registrado: ";
    const notaFixo = resposta.fixoRegistrado ? " 🔁 (marcado como fixo, vai lançar todo mês)" : "";
    const notaParcela = resposta.parcelas && resposta.parcelas.length > 1
        ? ` 📆 (parcela ${d.parcela_atual}/${d.parcela_total} — as próximas ${resposta.parcelas.length - 1} já foram agendadas)`
        : "";
    const notaDivisao = resposta.dividido ? ` (${formatarMoeda(resposta.valorTotal)} no total, dividido)` : "";
    mostrarResultadoRegistro(
        `${alerta}${formatarMoeda(d.valor)}${notaDivisao} — ${d.categoria} — ${d.forma_pagamento}${d.descricao ? ` — "${d.descricao}"` : ""}${notaFixo}${notaParcela}`,
        d.confianca_ia === "alta" ? "sucesso" : "aviso"
    );

    input.value = "";
    APP.despesas = await buscarDespesas();
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
    if (resposta.fixoRegistrado) {
        APP.despesasFixas = await buscarDespesasFixas();
        renderizarDespesasFixas();
    }
}

function mostrarResultadoRegistro(texto, tipo) {
    const resultado = document.getElementById("resultadoRegistro");
    resultado.textContent = texto;
    resultado.className = `resultado-registro resultado-${tipo}`;
    resultado.hidden = false;
}

/** Roda depois de login — busca tudo de uma vez (despesas, carteiras,
 *  cartões, investimentos, despesas fixas) e renderiza cada aba. */
async function inicializarDadosAutenticado() {
    const [despesas, carteiras, movimentosCarteira, cartoes, investimentos, despesasFixas] = await Promise.all([
        buscarDespesas(),
        buscarCarteiras(),
        buscarMovimentos(),
        buscarCartoes(),
        buscarInvestimentos(),
        buscarDespesasFixas()
    ]);

    APP.despesas = despesas;
    APP.carteiras = carteiras;
    APP.movimentosCarteira = movimentosCarteira;
    APP.cartoes = cartoes;
    APP.investimentos = investimentos;
    APP.despesasFixas = despesasFixas;

    popularFiltros();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarCartoes();
    renderizarInvestimentos();
    renderizarDespesasFixas();
    renderizarResumo();
}

function popularFiltros() {
    const filtroMes = document.getElementById("filtroMes");
    const filtroPessoa = document.getElementById("filtroPessoa");
    const filtroCategoria = document.getElementById("filtroCategoria");
    const inputPessoaDespesa = document.getElementById("inputPessoaDespesa");

    if (filtroMes && filtroPessoa && filtroCategoria) {
        const meses = [...new Set(APP.despesas.map(d => d.dataDespesa.slice(0, 7)))].sort().reverse();
        filtroMes.innerHTML = '<option value="">Todos os meses</option>' +
            meses.map(m => `<option value="${m}">${rotuloMes(m)}</option>`).join("");

        const pessoas = new Map();
        for (const d of APP.despesas) pessoas.set(d.usuarioId, d.usuarioNome);
        filtroPessoa.innerHTML = '<option value="">Todos</option>' +
            [...pessoas.entries()].map(([id, nome]) => `<option value="${id}">${escaparHtml(nome)}</option>`).join("");

        filtroCategoria.innerHTML = '<option value="">Todas as categorias</option>' +
            CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join("");
    }

    // Quem está lançando o gasto/investimento — parte de APP.carteiras
    // (1:1 com usuarios, sempre carregado) em vez de APP.despesas, que
    // pode estar vazio num casal recém-cadastrado.
    if (inputPessoaDespesa) {
        inputPessoaDespesa.innerHTML = '<option value="">Eu</option>' +
            APP.carteiras.map(c => `<option value="${c.usuarioId}">${escaparHtml(c.usuarioNome)}</option>`).join("") +
            '<option value="ambos">Ambos (dividir)</option>';
    }
}

function rotuloMes(chaveMes) {
    const [ano, mes] = chaveMes.split("-");
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mes) - 1]}/${ano}`;
}

function aplicarFiltros() {
    return APP.despesas.filter(d => {
        if (APP.filtros.mes && d.dataDespesa.slice(0, 7) !== APP.filtros.mes) return false;
        if (APP.filtros.usuarioId && String(d.usuarioId) !== String(APP.filtros.usuarioId)) return false;
        if (APP.filtros.categoria && d.categoria !== APP.filtros.categoria) return false;
        return true;
    });
}

function renderizarDashboard() {
    const lista = aplicarFiltros();
    renderizarKpis(lista);
    renderizarTabela(lista);
}

function renderizarKpis(lista) {
    const container = document.getElementById("kpisDespesas");
    if (!container) return;

    const total = lista.reduce((soma, d) => soma + d.valor, 0);

    const porCategoria = new Map();
    for (const d of lista) porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + d.valor);
    const categoriaTop = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0];

    const porPessoa = new Map();
    for (const d of lista) porPessoa.set(d.usuarioNome, (porPessoa.get(d.usuarioNome) ?? 0) + d.valor);

    container.innerHTML = `
        <div class="stat-tile">
            <div class="stat-label">Total no período</div>
            <div class="stat-valor">${formatarMoeda(total)}</div>
        </div>
        <div class="stat-tile">
            <div class="stat-label">Quantidade de gastos</div>
            <div class="stat-valor">${lista.length}</div>
        </div>
        <div class="stat-tile">
            <div class="stat-label">Maior categoria</div>
            <div class="stat-valor">${categoriaTop ? categoriaTop[0] : "-"}</div>
            <div class="stat-sublinha">${categoriaTop ? formatarMoeda(categoriaTop[1]) : ""}</div>
        </div>
        ${[...porPessoa.entries()].map(([nome, valor]) => `
            <div class="stat-tile">
                <div class="stat-label">Total de ${escaparHtml(nome)}</div>
                <div class="stat-valor">${formatarMoeda(valor)}</div>
            </div>
        `).join("")}
    `;
}

function renderizarTabela(lista) {
    const container = document.getElementById("listaDespesas");
    if (!container) return;

    if (lista.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma despesa encontrada.</p>';
        return;
    }

    container.innerHTML = `
        <table class="tabela-despesas">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Forma de pagamento</th>
                    <th>Pessoa</th>
                    <th>Valor</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(d => `
                    <tr>
                        <td>${formatarDataBR(d.dataDespesa)}</td>
                        <td title="${escaparHtml(d.mensagemOriginal)}">${escaparHtml(d.descricao || d.mensagemOriginal)}${d.parcelaTotal ? ` <span class="badge-parcela">${d.parcelaAtual}/${d.parcelaTotal}</span>` : ""}</td>
                        <td>${escaparHtml(d.categoria)}</td>
                        <td>${escaparHtml(d.formaPagamento)}</td>
                        <td>
                            <select class="select-pessoa-linha" data-id-despesa="${d.id}">
                                ${APP.carteiras.map(c => `<option value="${c.usuarioId}"${String(c.usuarioId) === String(d.usuarioId) ? " selected" : ""}>${escaparHtml(c.usuarioNome)}</option>`).join("")}
                            </select>
                        </td>
                        <td class="valor-cell">${formatarMoeda(d.valor)}</td>
                        <td><button type="button" class="botao-excluir" data-id="${d.id}" title="Excluir">&times;</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirDespesa(botao.dataset.id));
    });

    container.querySelectorAll(".select-pessoa-linha").forEach(select => {
        select.addEventListener("change", () => aoAlterarPessoaDespesa(select.dataset.idDespesa, select.value));
    });
}

async function aoAlterarPessoaDespesa(id, usuarioId) {
    const ok = await atualizarPessoaDespesa(id, usuarioId);
    if (!ok) {
        alert("Não foi possível reatribuir a despesa. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = await buscarDespesas();
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
}

async function aoExcluirDespesa(id) {
    if (!confirm("Excluir essa despesa?")) return;

    const ok = await excluirDespesa(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = APP.despesas.filter(d => String(d.id) !== String(id));
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBR(dataISO) {
    const [ano, mes, dia] = dataISO.split("-");
    return `${dia}/${mes}/${ano}`;
}

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = String(texto ?? "");
    return div.innerHTML;
}
