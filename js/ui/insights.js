/**
 * ==========================================================
 * UI de Insights ("Onde economizar")
 * ==========================================================
 * Botão que chama a IA (via js/services/insights.js) pra analisar os
 * últimos meses de gasto do casal e sugerir onde dá pra economizar.
 * Mostra o resultado no modal genérico (js/ui/modal.js).
 */

function registrarInsights() {
    const botao = document.getElementById("btnAnalisarGastos");
    if (botao) botao.addEventListener("click", aoAnalisarGastos);
}

async function aoAnalisarGastos() {
    const botao = document.getElementById("btnAnalisarGastos");
    const rotuloOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Analisando...";

    abrirModal(`
        <h2>🧠 Onde economizar</h2>
        <p class="alerta-vazio">Analisando os últimos meses de gasto...</p>
    `);

    const resposta = await buscarInsightsFinanceiros();

    botao.disabled = false;
    botao.textContent = rotuloOriginal;

    if (!resposta.ok) {
        abrirModal(`
            <h2>🧠 Onde economizar</h2>
            <p class="resultado-registro resultado-erro">${escaparHtml(resposta.mensagem)}</p>
        `);
        return;
    }

    abrirModal(`
        <h2>🧠 Onde economizar</h2>
        <p>${escaparHtml(resposta.resumo)}</p>
        <ul class="lista-dicas">
            ${resposta.dicas.map(dica => `<li>${escaparHtml(dica)}</li>`).join("")}
        </ul>
    `);
}
