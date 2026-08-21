/**
 * ==========================================================
 * UI de Modal
 * ==========================================================
 * Popup genérico reaproveitado pela Projeção de saldo e pela análise
 * "Onde economizar" — só troca o innerHTML de dentro da caixa.
 */

function registrarModal() {
    const overlay = document.getElementById("modalOverlay");
    const btnFechar = document.getElementById("btnFecharModal");

    if (btnFechar) btnFechar.addEventListener("click", fecharModal);
    if (overlay) overlay.addEventListener("click", evento => {
        if (evento.target === overlay) fecharModal();
    });
    document.addEventListener("keydown", evento => {
        if (evento.key === "Escape") fecharModal();
    });
}

function abrirModal(htmlConteudo) {
    const overlay = document.getElementById("modalOverlay");
    const conteudo = document.getElementById("modalConteudo");
    if (!overlay || !conteudo) return;

    conteudo.innerHTML = htmlConteudo;
    overlay.hidden = false;
}

function fecharModal() {
    const overlay = document.getElementById("modalOverlay");
    if (overlay) overlay.hidden = true;
}
