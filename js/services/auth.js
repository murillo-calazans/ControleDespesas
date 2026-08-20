/**
 * ==========================================================
 * Serviço de Autenticação (Supabase Auth)
 * ==========================================================
 * Login/logout e resolução do usuário logado a partir da tabela
 * "usuarios". Sem autocadastro — as duas contas são criadas
 * manualmente no painel do Supabase (Authentication -> Add user), e
 * cada uma é vinculada a uma linha em "usuarios" (ver
 * database/schema-supabase.sql).
 */

async function obterSessaoAtual() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Falha ao obter sessão:", error);
        return null;
    }
    return data.session;
}

async function entrar(email, senha) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) return { ok: false, mensagem: traduzirErroLogin(error) };
    return { ok: true, sessao: data.session };
}

async function sair() {
    await supabaseClient.auth.signOut();
    APP.usuario = null;
    APP.status.autenticado = false;
}

/**
 * Busca a linha em "usuarios" do usuário logado. Uma conta autenticada
 * no Supabase Auth mas sem linha vinculada em "usuarios" (ex.: login
 * criado mas o insert do schema ainda não foi rodado) não tem acesso —
 * trata como sem conta, não deixa entrar mesmo assim.
 */
async function carregarUsuarioAtual(sessao) {
    const { data, error } = await supabaseClient
        .from("usuarios")
        .select("id, nome")
        .eq("auth_user_id", sessao.user.id)
        .maybeSingle();

    if (error) {
        console.error("Falha ao carregar usuário:", error);
        return null;
    }

    if (!data) return null;

    return {
        id: data.id,
        nome: data.nome,
        email: sessao.user.email,
        authUserId: sessao.user.id
    };
}

function traduzirErroLogin(error) {
    if (error.message?.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    return `Erro ao entrar: ${error.message}`;
}
