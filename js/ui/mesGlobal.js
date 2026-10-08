/**
 * ==========================================================
 * UI do Mês Global
 * ==========================================================
 * Barra "‹ Outubro 2026 ›" logo abaixo do header — um mês só pra todas
 * as abas ao mesmo tempo (Resumo, Despesas, Movimentos da carteira,
 * fatura dos cartões, Investimentos), no lugar do seletor de mês que
 * cada aba tinha. Clicar no nome do mês volta pro mês atual.
 *
 * No crédito, "mês" é sempre a competência da fatura (mesma regra de
 * mesEfetivoDespesa em js/ui/dashboard.js) — então o mês escolhido aqui
 * é a mesma coisa que a fatura exibida na aba Cartões.
 */

const NOMES_MESES_EXTENSO = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function registrarMesGlobal() {
    const btnAnterior = document.getElementById("btnMesGlobalAnterior");
    const btnProximo = document.getElementById("btnMesGlobalProximo");
    const rotulo = document.getElementById("rotuloMesGlobal");

    if (btnAnterior) btnAnterior.addEventListener("click", () => mudarMesGlobal(-1));
    if (btnProximo) btnProximo.addEventListener("click", () => mudarMesGlobal(1));
    if (rotulo) rotulo.addEventListener("click", () => definirMesGlobal(chaveMesLocal(new Date())));
}

function rotuloMesExtenso(chaveMes) {
    const [ano, mes] = chaveMes.split("-");
    return `${NOMES_MESES_EXTENSO[Number(mes) - 1]} ${ano}`;
}

function mudarMesGlobal(delta) {
    if (!APP.mesGlobal) return;
    definirMesGlobal(somarMesACompetencia(APP.mesGlobal, delta));
}

/** Troca o mês de todas as abas de uma vez e re-renderiza só o que
 *  depende de mês (Fixas e o saldo das carteiras não dependem). */
function definirMesGlobal(chaveMes) {
    APP.mesGlobal = chaveMes;
    renderizarBarraMesGlobal();

    if (!APP.status.autenticado) return;
    renderizarResumo();
    renderizarDashboard();
    renderizarMovimentos();
    renderizarCartoes();
    renderizarInvestimentos();
    renderizarCasal();
}

function renderizarBarraMesGlobal() {
    const rotulo = document.getElementById("rotuloMesGlobal");
    if (!rotulo || !APP.mesGlobal) return;

    const ehMesAtual = APP.mesGlobal === chaveMesLocal(new Date());
    rotulo.textContent = rotuloMesExtenso(APP.mesGlobal);
    rotulo.classList.toggle("mes-global-fora-do-atual", !ehMesAtual);
    rotulo.title = ehMesAtual ? "Mês atual" : "Voltar pro mês atual";
}
