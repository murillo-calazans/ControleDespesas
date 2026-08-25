/**
 * ==========================================================
 * UI de Carteiras
 * ==========================================================
 * Saldo por pessoa (vindo de APP.carteiras, mantido pelo banco via
 * trigger) + formulário de depósito/retirada/ajuste manual + histórico.
 */

let filtroMesCarteiras = null; // "YYYY-MM" ou null (todos os meses)
let filtroMesCarteirasInicializado = false; // já aplicou o padrão (mês atual)?

function registrarCarteiras() {
    const form = document.getElementById("formMovimentoCarteira");
    if (form) form.addEventListener("submit", aoRegistrarMovimento);

    const filtroMes = document.getElementById("filtroMesCarteiras");
    if (filtroMes) filtroMes.addEventListener("change", () => {
        filtroMesCarteiras = filtroMes.value || null;
        renderizarMovimentos();
    });
}

async function aoRegistrarMovimento(evento) {
    evento.preventDefault();

    const carteiraId = document.getElementById("movCarteiraId").value;
    const tipo = document.getElementById("movTipo").value;
    const valorInput = document.getElementById("movValor");
    const descricao = document.getElementById("movDescricao").value.trim();
    const botao = document.getElementById("btnRegistrarMovimento");

    const valor = Number(valorInput.value);
    if (!carteiraId || !valor || valor <= 0) return;

    botao.disabled = true;
    const ok = await registrarMovimento({ carteiraId, tipo, valor, descricao });
    botao.disabled = false;

    if (!ok) {
        alert("Não foi possível registrar. Veja o console pra detalhes.");
        return;
    }

    valorInput.value = "";
    document.getElementById("movDescricao").value = "";

    APP.carteiras = await buscarCarteiras();
    APP.movimentosCarteira = await buscarMovimentos();
    renderizarCarteiras();
    renderizarResumo();
}

function renderizarCarteiras() {
    renderizarKpisCarteiras();
    renderizarSelectCarteiras();
    renderizarSalarios();
    popularFiltroMesCarteiras();
    renderizarMovimentos();
}

function renderizarSalarios() {
    const container = document.getElementById("listaSalarios");
    if (!container) return;

    container.innerHTML = APP.carteiras.map(c => {
        const salario = APP.salarios.find(s => String(s.usuarioId) === String(c.usuarioId));

        return `
            <div class="linha-salario">
                <span class="linha-salario-nome">${escaparHtml(c.usuarioNome)}</span>
                <input type="number" step="0.01" min="0.01" class="input-salario-valor" data-usuario-id="${c.usuarioId}" value="${salario ? salario.valor : ""}" placeholder="Valor do salário">
                <button type="button" class="botao-primario botao-pequeno" data-salvar-salario="${c.usuarioId}">Salvar</button>
                ${salario ? `<button type="button" class="botao-icone" data-toggle-salario="${salario.id}" data-ativo="${salario.ativo}">${salario.ativo ? "⏸️ Pausar" : "▶️ Reativar"}</button>` : ""}
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-salvar-salario]").forEach(botao => {
        botao.addEventListener("click", () => aoSalvarSalario(botao.dataset.salvarSalario));
    });

    container.querySelectorAll("[data-toggle-salario]").forEach(botao => {
        botao.addEventListener("click", () => aoTogglarSalario(botao.dataset.toggleSalario, botao.dataset.ativo === "true"));
    });
}

async function aoSalvarSalario(usuarioId) {
    const input = document.querySelector(`.input-salario-valor[data-usuario-id="${usuarioId}"]`);
    const valor = Number(input.value);
    if (!valor || valor <= 0) return;

    const ok = await salvarSalario(usuarioId, valor);
    if (!ok) {
        alert("Não foi possível salvar o salário. Veja o console pra detalhes.");
        return;
    }

    APP.salarios = await buscarSalarios();
    renderizarSalarios();
}

async function aoTogglarSalario(id, ativoAtual) {
    const ok = await atualizarSalario(id, { ativo: !ativoAtual });
    if (!ok) {
        alert("Não foi possível atualizar. Veja o console pra detalhes.");
        return;
    }

    APP.salarios = await buscarSalarios();
    renderizarSalarios();
}

function popularFiltroMesCarteiras() {
    const select = document.getElementById("filtroMesCarteiras");
    if (!select) return;

    // Mesma lógica do filtro de mês das despesas (ver popularFiltros em
    // js/ui/dashboard.js): inclui até dezembro, mesmo sem movimento
    // nenhum ainda, pra dar pra ver a projeção do salário em meses futuros.
    const mesAtual = new Date().toISOString().slice(0, 7);
    const meses = [...new Set([...mesesAteFimDoAno(mesAtual), ...APP.movimentosCarteira.map(m => m.criadoEm.slice(0, 7))])].sort().reverse();
    select.innerHTML = '<option value="">Todos os meses</option>' +
        meses.map(m => `<option value="${m}">${rotuloMes(m)}</option>`).join("");

    if (!filtroMesCarteirasInicializado) {
        filtroMesCarteiras = mesAtual;
        filtroMesCarteirasInicializado = true;
    }
    select.value = filtroMesCarteiras || "";
}

/** Salários ativos que ainda não foram efetivados (nenhum depósito
 *  vinculado) em "mesChave" — devolve um "movimento" projetado pra
 *  cada um, só pra exibição (nunca gravado). Sem data fixa: o salário
 *  pode cair adiantado ou atrasado, por isso a confirmação é manual
 *  (botão "Efetivar"), não uma data calculada. Mesma ideia de
 *  despesasFixasVirtuaisParaMes em js/ui/dashboard.js. */
function salariosVirtuaisParaMes(mesChave) {
    if (!mesChave) return [];

    return APP.salarios
        .filter(s => s.ativo
            && s.criadoEm.slice(0, 7) <= mesChave
            && !APP.movimentosCarteira.some(m => m.salarioId === s.id && m.criadoEm.slice(0, 7) === mesChave))
        .map(s => ({
            id: `salario-${s.id}-${mesChave}`,
            tipo: "deposito",
            valor: s.valor,
            descricao: "Salário",
            registradoPorNome: s.usuarioNome,
            criadoEm: `${mesChave}-01`, // só pra ordenar a lista, não é uma data real
            salarioId: s.id,
            usuarioId: s.usuarioId,
            virtual: true
        }));
}

function renderizarKpisCarteiras() {
    const container = document.getElementById("kpisCarteiras");
    if (!container) return;

    container.innerHTML = APP.carteiras.map(c => `
        <div class="stat-tile">
            <div class="stat-label">Carteira de ${escaparHtml(c.usuarioNome)}</div>
            <div class="stat-valor">${formatarMoeda(c.saldo)}</div>
        </div>
    `).join("");
}

function renderizarSelectCarteiras() {
    const select = document.getElementById("movCarteiraId");
    if (!select) return;

    select.innerHTML = APP.carteiras
        .map(c => `<option value="${c.id}">Carteira de ${escaparHtml(c.usuarioNome)}</option>`)
        .join("");
}

function renderizarMovimentos() {
    const container = document.getElementById("listaMovimentos");
    if (!container) return;

    const listaReal = filtroMesCarteiras
        ? APP.movimentosCarteira.filter(m => m.criadoEm.slice(0, 7) === filtroMesCarteiras)
        : APP.movimentosCarteira;

    // Projeção do salário só faz sentido com um mês específico
    // selecionado (não dá pra projetar em cima de "Todos os meses").
    const lista = [...listaReal, ...salariosVirtuaisParaMes(filtroMesCarteiras)]
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

    if (lista.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum movimento encontrado.</p>';
        return;
    }

    const rotulos = { deposito: "Depósito", retirada: "Retirada", ajuste: "Ajuste" };

    container.innerHTML = `
        <table class="tabela-despesas">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th>Registrado por</th>
                    <th>Valor</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(m => m.virtual ? `
                    <tr class="linha-despesa-virtual" title="Salário ainda não confirmado esse mês">
                        <td>—</td>
                        <td>${rotulos[m.tipo] ?? m.tipo}</td>
                        <td>${escaparHtml(m.descricao)} <span class="badge-parcela">não efetivado</span></td>
                        <td>${escaparHtml(m.registradoPorNome)}</td>
                        <td class="valor-cell">${formatarMoeda(m.valor)}</td>
                        <td><button type="button" class="botao-icone" data-efetivar-salario="${m.salarioId}" data-usuario-id="${m.usuarioId}" data-valor="${m.valor}" title="Efetivar agora">✅ Efetivar</button></td>
                    </tr>
                ` : `
                    <tr>
                        <td>${formatarDataBR(m.criadoEm.slice(0, 10))}</td>
                        <td>${rotulos[m.tipo] ?? m.tipo}</td>
                        <td>${escaparHtml(m.descricao || "-")}</td>
                        <td>${escaparHtml(m.registradoPorNome)}</td>
                        <td class="valor-cell">${m.tipo === "retirada" ? "-" : ""}${formatarMoeda(m.valor)}</td>
                        <td><button type="button" class="botao-excluir" data-id="${m.id}" title="Excluir">&times;</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirMovimento(botao.dataset.id));
    });

    container.querySelectorAll("[data-efetivar-salario]").forEach(botao => {
        botao.addEventListener("click", () => aoEfetivarSalario(
            botao.dataset.efetivarSalario, botao.dataset.usuarioId, Number(botao.dataset.valor)
        ));
    });
}

async function aoEfetivarSalario(salarioId, usuarioId, valor) {
    if (!confirm(`Efetivar o salário de ${formatarMoeda(valor)}? Isso deposita o valor na carteira agora.`)) return;

    const ok = await efetivarSalario(salarioId, usuarioId, valor);
    if (!ok) {
        alert("Não foi possível efetivar o salário. Veja o console pra detalhes.");
        return;
    }

    APP.carteiras = await buscarCarteiras();
    APP.movimentosCarteira = await buscarMovimentos();
    renderizarCarteiras();
    renderizarResumo();
}

async function aoExcluirMovimento(id) {
    if (!confirm("Excluir esse movimento?")) return;

    const ok = await excluirMovimento(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    APP.movimentosCarteira = APP.movimentosCarteira.filter(m => String(m.id) !== String(id));
    APP.carteiras = await buscarCarteiras();
    renderizarCarteiras();
    renderizarResumo();
}
