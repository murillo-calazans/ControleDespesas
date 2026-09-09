/**
 * ==========================================================
 * UI de Perfil
 * ==========================================================
 * Modal com dados da conta (nome/e-mail), troca de senha (Supabase
 * Auth) e alternância de tema — aberto a partir do bloco de usuário
 * no header. Reaproveita o modal genérico (js/ui/modal.js) e o tema
 * já aplicado por js/core/tema.js.
 */

function registrarPerfil() {
    const bloco = document.getElementById("headerUsuario");
    if (bloco) bloco.addEventListener("click", abrirPerfil);
}

function abrirPerfil() {
    abrirModal(perfilHtml());
    registrarEventosPerfil();
}

function perfilHtml() {
    const usuario = APP.usuario;

    return `
        <h2>👤 Perfil</h2>

        <div class="perfil-linha">
            <span class="perfil-rotulo">Nome</span>
            <span class="perfil-valor">${escaparHtml(usuario?.nome ?? "-")}</span>
        </div>
        <div class="perfil-linha">
            <span class="perfil-rotulo">E-mail</span>
            <span class="perfil-valor">${escaparHtml(usuario?.email ?? "-")}</span>
        </div>
        <div class="perfil-linha">
            <span class="perfil-rotulo">Senha</span>
            <span class="perfil-valor perfil-senha-mascarada">••••••••</span>
        </div>

        <div class="perfil-acoes">
            <button type="button" id="btnAlternarTema" class="botao-secundario">${rotuloBotaoTema()}</button>
            <button type="button" id="btnAbrirTrocaSenha" class="botao-secundario">🔒 Alterar senha</button>
        </div>

        <form id="formTrocaSenha" class="form-nova-despesa perfil-form-senha" hidden>
            <input type="password" id="perfilNovaSenha" placeholder="Nova senha" autocomplete="new-password" required minlength="6">
            <input type="password" id="perfilConfirmarSenha" placeholder="Confirmar nova senha" autocomplete="new-password" required minlength="6">
            <button type="submit" id="btnSalvarSenha" class="botao-primario">Salvar nova senha</button>
        </form>

        <p id="perfilMensagem" class="resultado-registro" hidden></p>
    `;
}

function rotuloBotaoTema() {
    return temaAtual() === "escuro" ? "☀️ Modo claro" : "🌙 Modo escuro";
}

function registrarEventosPerfil() {
    const btnTema = document.getElementById("btnAlternarTema");
    if (btnTema) {
        btnTema.addEventListener("click", () => {
            alternarTema();
            btnTema.textContent = rotuloBotaoTema();
        });
    }

    const btnAbrirTroca = document.getElementById("btnAbrirTrocaSenha");
    const form = document.getElementById("formTrocaSenha");
    if (btnAbrirTroca && form) {
        btnAbrirTroca.addEventListener("click", () => {
            form.hidden = !form.hidden;
        });
    }

    if (form) form.addEventListener("submit", aoTrocarSenha);
}

function mostrarMensagemPerfil(texto, tipo) {
    const mensagem = document.getElementById("perfilMensagem");
    if (!mensagem) return;
    mensagem.textContent = texto;
    mensagem.className = `resultado-registro resultado-${tipo}`;
    mensagem.hidden = false;
}

async function aoTrocarSenha(evento) {
    evento.preventDefault();

    const novaSenha = document.getElementById("perfilNovaSenha").value;
    const confirmarSenha = document.getElementById("perfilConfirmarSenha").value;
    const botao = document.getElementById("btnSalvarSenha");

    if (novaSenha.length < 6) {
        mostrarMensagemPerfil("A senha precisa ter pelo menos 6 caracteres.", "erro");
        return;
    }

    if (novaSenha !== confirmarSenha) {
        mostrarMensagemPerfil("As senhas não são iguais.", "erro");
        return;
    }

    botao.disabled = true;
    const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
    botao.disabled = false;

    if (error) {
        mostrarMensagemPerfil(`Não foi possível trocar a senha: ${error.message}`, "erro");
        return;
    }

    mostrarMensagemPerfil("Senha alterada com sucesso.", "sucesso");
    document.getElementById("formTrocaSenha").reset();
}
