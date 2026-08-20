/**
 * ==========================================================
 * UI de Abas
 * ==========================================================
 * Troca de aba por classe CSS, mesmo espírito do body.nao-autenticado
 * já usado pro login — sem router, sem framework.
 */

function registrarAbas() {
    document.querySelectorAll(".abas button[data-aba]").forEach(botao => {
        botao.addEventListener("click", () => selecionarAba(botao.dataset.aba));
    });
}

function selecionarAba(aba) {
    APP.abaAtiva = aba;

    document.querySelectorAll(".abas button[data-aba]").forEach(botao => {
        botao.classList.toggle("aba-ativa", botao.dataset.aba === aba);
    });

    document.querySelectorAll("[data-aba-conteudo]").forEach(elemento => {
        elemento.hidden = elemento.dataset.abaConteudo !== aba;
    });
}
