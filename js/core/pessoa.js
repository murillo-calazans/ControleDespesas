/**
 * ==========================================================
 * "O que é meu" — visão de quem está logado
 * ==========================================================
 * Cada um do casal abre o app vendo só os próprios números (Resumo,
 * Despesas, Carteira, Cartões, Fixas, Investimentos); a visão
 * conjunta fica só na aba Casal (js/ui/casal.js). O banco continua
 * deixando os dois lerem tudo (ver database/schema-supabase.sql) — é
 * separação de tela, não de permissão.
 *
 * Regra de rateio: despesa compartilhada ("Ambos") é metade de cada um
 * — a mesma que o trigger de saldo usa no banco (ver
 * database/schema-despesas-compartilhadas.sql).
 */

function meuId() {
    return APP.usuario?.id ?? null;
}

function ehMeu(item) {
    return String(item.usuarioId) === String(meuId());
}

/** Despesa (ou despesa fixa) que entra na minha visão: minha ou "Ambos". */
function despesaMeEnvolve(despesa) {
    return despesa.compartilhada || ehMeu(despesa);
}

/** Quanto de uma despesa (ou despesa fixa) é meu: valor cheio se é só
 *  minha, metade se é "Ambos", zero se é só do parceiro. */
function minhaParte(despesa) {
    if (despesa.compartilhada) return despesa.valor / 2;
    return ehMeu(despesa) ? despesa.valor : 0;
}

function minhaCarteira() {
    return APP.carteiras.find(ehMeu) ?? null;
}
