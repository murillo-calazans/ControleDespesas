/**
 * ==========================================================
 * UI de Carteiras
 * ==========================================================
 * Saldo por pessoa (vindo de APP.carteiras, mantido pelo banco via
 * trigger) + formulário de depósito/retirada/ajuste manual + histórico.
 */

function registrarCarteiras() {
    const form = document.getElementById("formMovimentoCarteira");
    if (form) form.addEventListener("submit", aoRegistrarMovimento);
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
}

function renderizarCarteiras() {
    renderizarKpisCarteiras();
    renderizarSelectCarteiras();
    renderizarMovimentos();
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

    if (APP.movimentosCarteira.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhum movimento ainda.</p>';
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
                </tr>
            </thead>
            <tbody>
                ${APP.movimentosCarteira.map(m => `
                    <tr>
                        <td>${formatarDataBR(m.criadoEm.slice(0, 10))}</td>
                        <td>${rotulos[m.tipo] ?? m.tipo}</td>
                        <td>${escaparHtml(m.descricao || "-")}</td>
                        <td>${escaparHtml(m.registradoPorNome)}</td>
                        <td class="valor-cell">${m.tipo === "retirada" ? "-" : ""}${formatarMoeda(m.valor)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}
