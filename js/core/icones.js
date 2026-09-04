/**
 * ==========================================================
 * Ícones dos cards de estatística (.stat-tile)
 * ==========================================================
 * Badge circular colorido + emoji/inicial — usado por toda tela que
 * renderiza um .stat-tile (dashboard, carteiras, cartões, fixas,
 * investimentos, resumo), pra manter o mesmo visual em todo canto.
 */

const PALETA_ICONE_STAT = {
    verde: { fundo: "#DCEEDF", cor: "#1F5C3D" },
    azul: { fundo: "#DCE7F7", cor: "#2A5DA8" },
    laranja: { fundo: "#FBE7D2", cor: "#B4611C" },
    rosa: { fundo: "#F6DEEA", cor: "#A83E77" },
    roxo: { fundo: "#E6DEF6", cor: "#5B3EA8" },
    ciano: { fundo: "#DAEEF0", cor: "#1E6E77" }
};

/** Badge genérico: um emoji num círculo colorido. */
function statIcone(emoji, corChave) {
    const cores = PALETA_ICONE_STAT[corChave] ?? PALETA_ICONE_STAT.verde;
    return `<div class="stat-icone" style="background:${cores.fundo};color:${cores.cor}">${emoji}</div>`;
}

/** Badge de pessoa: inicial do nome num círculo — cor estável por
 *  posição (a mesma pessoa sempre cai na mesma cor entre re-renders,
 *  já que a ordem de APP.carteiras/porPessoa não muda). */
function statIconePessoa(nome, indice) {
    const paleta = ["rosa", "verde", "azul", "laranja"];
    const inicial = (nome || "?").trim().charAt(0).toUpperCase();
    return statIcone(inicial, paleta[indice % paleta.length]);
}

/** Cor suave por bandeira — só Nubank (roxo) e Itaú (laranja) por
 *  enquanto, os dois cartões desse casal (ver variáveis --nubank- e
 *  --itau- em css/style.css). Outro banco cai no ícone azul padrão. */
const PALETA_BANCO = {
    nubank: { fundo: "#EDE3F7", cor: "#6B3FA0" },
    itau: { fundo: "#FBE7D2", cor: "#B4611C" }
};

/** Identifica a bandeira pelo nome cadastrado do cartão (ex: "Nubank",
 *  "Itaú", "Cartão Itau final 1234") — normaliza acento pra pegar
 *  "Itaú" e "Itau" igual. Sem match, devolve null (visual padrão). */
function identificarBanco(nomeCartao) {
    const normalizado = (nomeCartao || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (normalizado.includes("nubank")) return "nubank";
    if (normalizado.includes("itau")) return "itau";
    return null;
}

/** Ícone do card de cartão, na cor da bandeira quando reconhecida. */
function statIconeBanco(nomeCartao) {
    const banco = identificarBanco(nomeCartao);
    const cores = PALETA_BANCO[banco];
    if (!cores) return statIcone("💳", "azul");
    return `<div class="stat-icone" style="background:${cores.fundo};color:${cores.cor}">💳</div>`;
}
