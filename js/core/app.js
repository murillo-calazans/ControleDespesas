/**
 * ==========================================================
 * Inicialização da Aplicação
 * ==========================================================
 */

document.addEventListener("DOMContentLoaded", iniciarSistema);

/** PWA instalado (Chrome Android via display-mode, Safari iOS via
 *  navigator.standalone) ou aberto com ?modo=app (mesmo start_url do
 *  manifest.json) → modo só-visualização: some formulário/botão de
 *  lançamento, lançar continua exclusivo do navegador normal. */
function detectarModoApp() {
    const instalado = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const querystring = new URLSearchParams(window.location.search).get("modo") === "app";

    if (instalado || querystring) {
        document.body.classList.add("modo-app");
    }
}

function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(erro => console.error("Falha ao registrar service worker:", erro));
    });
}

async function iniciarSistema() {
    detectarModoApp();
    registrarServiceWorker();
    registrarLogin();
    registrarPerfil();
    registrarModal();
    registrarDashboard();
    registrarAbas();
    registrarCarteiras();
    registrarCartoes();
    registrarInvestimentos();
    registrarDespesasFixas();
    registrarProjecao();
    registrarInsights();

    const sessao = await obterSessaoAtual();

    if (sessao) {
        const usuario = await carregarUsuarioAtual(sessao);

        if (usuario) {
            APP.usuario = usuario;
            APP.status.autenticado = true;
            mostrarAppAutenticado();
            await inicializarDadosAutenticado();
        } else {
            await sair();
            mostrarTelaLogin();
        }
    } else {
        mostrarTelaLogin();
    }
}
