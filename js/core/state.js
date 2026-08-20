/**
 * ==========================================================
 * Controle de Despesas
 * Estado Global da Aplicação
 * ==========================================================
 */

const APP = {

    info: {
        nome: "Controle de Despesas",
        versao: "0.1.0"
    },

    status: {
        autenticado: false
    },

    // Preenchido após login: { id, nome, authUserId } (linha em "usuarios").
    usuario: null,

    // Todas as despesas do casal já carregadas do Supabase, mais recente
    // primeiro — igual raciocínio do COP Analytics: busca tudo uma vez,
    // filtro/agregação acontece em memória, sem round-trip pro banco a
    // cada clique de filtro.
    despesas: [],

    filtros: {
        mes: null,        // "YYYY-MM" ou null (todos os meses)
        usuarioId: null,  // id em "usuarios" ou null (todo mundo)
        categoria: null   // string ou null (todas)
    }

};
