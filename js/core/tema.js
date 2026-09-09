/**
 * ==========================================================
 * Tema claro/escuro
 * ==========================================================
 * Carregado no <head>, antes do CSS — aplica a preferência salva (ou
 * a do sistema, se nunca escolheu) já no primeiro parse do <html>,
 * pra não piscar o tema errado por uma fração de segundo.
 */

const CHAVE_TEMA_PREFERIDO = "tema-preferido";

function temaSalvo() {
    return localStorage.getItem(CHAVE_TEMA_PREFERIDO);
}

function temaDoSistema() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function temaAtual() {
    return document.documentElement.dataset.theme === "escuro" ? "escuro" : "claro";
}

function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;

    // Cor da barra de status/task switcher no Android acompanha o tema.
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) metaThemeColor.content = tema === "escuro" ? "#131E17" : "#163A26";
}

function alternarTema() {
    const novoTema = temaAtual() === "escuro" ? "claro" : "escuro";
    localStorage.setItem(CHAVE_TEMA_PREFERIDO, novoTema);
    aplicarTema(novoTema);
    return novoTema;
}

aplicarTema(temaSalvo() || temaDoSistema());
