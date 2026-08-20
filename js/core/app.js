/**
 * ==========================================================
 * Inicialização da Aplicação
 * ==========================================================
 */

document.addEventListener("DOMContentLoaded", iniciarSistema);

async function iniciarSistema() {
    registrarLogin();
    registrarDashboard();
    registrarAbas();
    registrarCarteiras();
    registrarCartoes();
    registrarInvestimentos();
    registrarDespesasFixas();

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
