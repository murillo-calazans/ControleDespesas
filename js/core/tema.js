/**
 * ==========================================================
 * Tema claro/escuro + cor de destaque
 * ==========================================================
 * Carregado no <head>, antes do CSS — aplica a preferência salva (ou
 * a do sistema, se nunca escolheu) já no primeiro parse do <html>,
 * pra não piscar o tema errado por uma fração de segundo.
 *
 * Cor de destaque (verde/rosa) é independente do claro/escuro — vira
 * o atributo data-accent no <html> (ver :root[data-accent="rosa"] em
 * css/style.css). Fica salva por usuário (cada um do casal escolhe a
 * sua), mais uma cópia "da última pessoa que usou esse aparelho" pra
 * já pintar certo antes do login, quando ainda não se sabe quem é.
 */

const CHAVE_TEMA_PREFERIDO = "tema-preferido";
const CHAVE_COR_DESTAQUE = "cor-destaque";

// Cor da barra de status/task switcher no Android, por combinação.
const COR_BARRA_STATUS = {
    claro: { verde: "#163A26", rosa: "#5A1A35" },
    escuro: { verde: "#131E17", rosa: "#1E1418" }
};

function temaSalvo() {
    return localStorage.getItem(CHAVE_TEMA_PREFERIDO);
}

function temaDoSistema() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function temaAtual() {
    return document.documentElement.dataset.theme === "escuro" ? "escuro" : "claro";
}

function corDestaqueAtual() {
    return document.documentElement.dataset.accent === "rosa" ? "rosa" : "verde";
}

function atualizarCorBarraStatus() {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) metaThemeColor.content = COR_BARRA_STATUS[temaAtual()][corDestaqueAtual()];
}

function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    atualizarCorBarraStatus();
}

function alternarTema() {
    const novoTema = temaAtual() === "escuro" ? "claro" : "escuro";
    localStorage.setItem(CHAVE_TEMA_PREFERIDO, novoTema);
    aplicarTema(novoTema);
    return novoTema;
}

function aplicarCorDestaque(cor) {
    if (cor === "rosa") document.documentElement.dataset.accent = "rosa";
    else delete document.documentElement.dataset.accent;
    atualizarCorBarraStatus();
}

/** Cor salva pra esse usuário — ou, sem usuário (antes do login) ou
 *  sem escolha dele ainda, a última usada nesse aparelho. */
function corDestaqueSalva(usuarioId) {
    return (usuarioId && localStorage.getItem(`${CHAVE_COR_DESTAQUE}:${usuarioId}`))
        || localStorage.getItem(CHAVE_COR_DESTAQUE)
        || "verde";
}

function escolherCorDestaque(cor, usuarioId) {
    if (usuarioId) localStorage.setItem(`${CHAVE_COR_DESTAQUE}:${usuarioId}`, cor);
    localStorage.setItem(CHAVE_COR_DESTAQUE, cor);
    aplicarCorDestaque(cor);
}

aplicarCorDestaque(corDestaqueSalva(null));
aplicarTema(temaSalvo() || temaDoSistema());
