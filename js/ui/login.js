/**
 * ==========================================================
 * UI de Login/Logout
 * ==========================================================
 */

function registrarLogin() {
    const form = document.getElementById("formLogin");
    const botaoSair = document.getElementById("btnSair");

    if (form) {
        form.addEventListener("submit", async evento => {
            evento.preventDefault();
            await tentarEntrar();
        });
    }

    if (botaoSair) {
        botaoSair.addEventListener("click", async () => {
            await sair();
            mostrarTelaLogin();
        });
    }
}

async function tentarEntrar() {
    const form = document.getElementById("formLogin");
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;
    const botao = document.getElementById("btnEntrar");
    const erro = document.getElementById("loginErro");

    erro.hidden = true;
    botao.disabled = true;

    const resultado = await entrar(email, senha);

    if (!resultado.ok) {
        erro.textContent = resultado.mensagem;
        erro.hidden = false;
        botao.disabled = false;
        return;
    }

    const usuario = await carregarUsuarioAtual(resultado.sessao);

    if (!usuario) {
        erro.textContent = "Sua conta ainda não está vinculada. Fale com quem configurou o site.";
        erro.hidden = false;
        botao.disabled = false;
        await sair();
        return;
    }

    APP.usuario = usuario;
    APP.status.autenticado = true;

    botao.disabled = false;
    erro.hidden = true;
    form.reset();

    mostrarAppAutenticado();
    await inicializarDadosAutenticado();
}

function mostrarTelaLogin() {
    document.body.classList.add("nao-autenticado");
}

function mostrarAppAutenticado() {
    document.body.classList.remove("nao-autenticado");

    const rotulo = document.getElementById("usuarioLogado");
    if (rotulo) rotulo.textContent = APP.usuario.nome;
}
