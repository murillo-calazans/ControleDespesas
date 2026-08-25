/**
 * ==========================================================
 * UI do Dashboard
 * ==========================================================
 * Campo de texto livre (chama a IA via registrarDespesa), filtros
 * (mês/pessoa/categoria), KPIs e a tabela de despesas. Não calcula
 * nada de "verdade" aqui além de somas simples — os dados já vêm
 * prontos de js/services/despesas.js.
 */

// Mesma lista da tabela despesas (database/schema-supabase.sql) e da
// Edge Function parse-despesa — usada só pro filtro de categoria.
const CATEGORIAS = [
    "Alimentação", "Mercado", "Transporte", "Saúde", "Lazer",
    "Casa", "Educação", "Assinaturas", "Compras",
    "Filho", "Pessoal", "Presentes", "Lanche", "Outros"
];

function registrarDashboard() {
    const form = document.getElementById("formNovaDespesa");
    if (form) form.addEventListener("submit", aoRegistrarDespesa);

    const filtroMes = document.getElementById("filtroMes");
    const filtroPessoa = document.getElementById("filtroPessoa");
    const filtroCategoria = document.getElementById("filtroCategoria");

    if (filtroMes) filtroMes.addEventListener("change", aoMudarFiltro);
    if (filtroPessoa) filtroPessoa.addEventListener("change", aoMudarFiltro);
    if (filtroCategoria) filtroCategoria.addEventListener("change", aoMudarFiltro);
}

function aoMudarFiltro() {
    APP.filtros.mes = document.getElementById("filtroMes").value || null;
    APP.filtros.usuarioId = document.getElementById("filtroPessoa").value || null;
    APP.filtros.categoria = document.getElementById("filtroCategoria").value || null;
    renderizarDashboard();
}

async function aoRegistrarDespesa(evento) {
    evento.preventDefault();

    const input = document.getElementById("inputTextoDespesa");
    const botao = document.getElementById("btnRegistrarDespesa");
    const resultado = document.getElementById("resultadoRegistro");

    const texto = input.value.trim();
    if (!texto) return;

    const pessoaAlvo = document.getElementById("inputPessoaDespesa")?.value || null;

    botao.disabled = true;
    resultado.hidden = true;

    const resposta = await registrarDespesa(texto, pessoaAlvo);

    botao.disabled = false;

    if (!resposta.ok) {
        mostrarResultadoRegistro(`❌ ${resposta.mensagem}`, "erro");
        return;
    }

    if (resposta.tipo === "nenhum" || !resposta.registrado) {
        mostrarResultadoRegistro("🤔 Não entendi isso como um gasto ou investimento — tenta reformular?", "aviso");
        return;
    }

    if (resposta.tipo === "investimento") {
        const inv = resposta.investimento;
        const notaDivisaoInv = resposta.dividido ? ` (${formatarMoeda(resposta.valorTotal)} no total, dividido)` : "";
        mostrarResultadoRegistro(
            `💹 Investimento registrado: ${formatarMoeda(inv.valor)}${notaDivisaoInv}${inv.conta ? ` — ${inv.conta}` : ""}`,
            "sucesso"
        );
        input.value = "";
        APP.investimentos = await buscarInvestimentos();
        APP.carteiras = await buscarCarteiras();
        renderizarInvestimentos();
        renderizarCarteiras();
        renderizarResumo();
        return;
    }

    const d = resposta.despesa;
    const alerta = d.confianca_ia === "baixa" || d.confianca_ia === "media" ? "⚠️ Não tenho certeza — confere: " : "✅ Registrado: ";
    const notaFixo = resposta.fixoRegistrado ? " 🔁 (marcado como fixo, vai lançar todo mês)" : "";
    const notaParcela = resposta.parcelas && resposta.parcelas.length > 1
        ? ` 📆 (parcela ${d.parcela_atual}/${d.parcela_total} — as próximas ${resposta.parcelas.length - 1} já foram agendadas)`
        : "";
    const notaDivisao = resposta.dividido ? ` (${formatarMoeda(resposta.valorTotal)} no total, dividido)` : "";
    mostrarResultadoRegistro(
        `${alerta}${formatarMoeda(d.valor)}${notaDivisao} — ${d.categoria} — ${d.forma_pagamento}${d.descricao ? ` — "${d.descricao}"` : ""}${notaFixo}${notaParcela}`,
        d.confianca_ia === "alta" ? "sucesso" : "aviso"
    );

    input.value = "";
    APP.despesas = await buscarDespesas();
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
    if (resposta.fixoRegistrado) {
        APP.despesasFixas = await buscarDespesasFixas();
        renderizarDespesasFixas();
    }
}

function mostrarResultadoRegistro(texto, tipo) {
    const resultado = document.getElementById("resultadoRegistro");
    resultado.textContent = texto;
    resultado.className = `resultado-registro resultado-${tipo}`;
    resultado.hidden = false;
}

/** Roda depois de login — busca tudo de uma vez (despesas, carteiras,
 *  cartões, investimentos, despesas fixas) e renderiza cada aba. */
async function inicializarDadosAutenticado() {
    const [despesas, carteiras, movimentosCarteira, cartoes, investimentos, despesasFixas, salarios] = await Promise.all([
        buscarDespesas(),
        buscarCarteiras(),
        buscarMovimentos(),
        buscarCartoes(),
        buscarInvestimentos(),
        buscarDespesasFixas(),
        buscarSalarios()
    ]);

    APP.despesas = despesas;
    APP.carteiras = carteiras;
    APP.movimentosCarteira = movimentosCarteira;
    APP.cartoes = cartoes;
    APP.investimentos = investimentos;
    APP.despesasFixas = despesasFixas;
    APP.salarios = salarios;

    popularFiltros();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarCartoes();
    renderizarInvestimentos();
    renderizarDespesasFixas();
    renderizarResumo();
}

function popularFiltros() {
    const filtroMes = document.getElementById("filtroMes");
    const filtroPessoa = document.getElementById("filtroPessoa");
    const filtroCategoria = document.getElementById("filtroCategoria");
    const inputPessoaDespesa = document.getElementById("inputPessoaDespesa");

    if (filtroMes && filtroPessoa && filtroCategoria) {
        // Sempre inclui do mês atual até dezembro (mesmo sem despesa
        // lançada neles ainda), pra dar pra selecionar meses futuros e já
        // ver a projeção das despesas fixas neles (ver
        // despesasFixasVirtuaisParaMes).
        const mesAtual = new Date().toISOString().slice(0, 7);
        const meses = [...new Set([...mesesAteFimDoAno(mesAtual), ...APP.despesas.map(d => d.dataDespesa.slice(0, 7))])].sort().reverse();
        filtroMes.innerHTML = '<option value="">Todos os meses</option>' +
            meses.map(m => `<option value="${m}">${rotuloMes(m)}</option>`).join("");

        // Abre por padrão no mês atual, em vez de "Todos os meses" — o
        // usuário sempre quer ver o mês corrente ao abrir o site, não a
        // lista inteira desde o começo.
        filtroMes.value = mesAtual;
        APP.filtros.mes = mesAtual;

        // Parte de APP.carteiras (1:1 com usuarios) em vez de APP.despesas,
        // senão uma pessoa que nunca registrou nada no próprio nome (só em
        // despesas compartilhadas ou lançadas pelo parceiro) não apareceria.
        filtroPessoa.innerHTML = '<option value="">Todos</option>' +
            APP.carteiras.map(c => `<option value="${c.usuarioId}">${escaparHtml(c.usuarioNome)}</option>`).join("");

        filtroCategoria.innerHTML = '<option value="">Todas as categorias</option>' +
            CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join("");
    }

    // Quem está lançando o gasto/investimento — parte de APP.carteiras
    // (1:1 com usuarios, sempre carregado) em vez de APP.despesas, que
    // pode estar vazio num casal recém-cadastrado.
    if (inputPessoaDespesa) {
        inputPessoaDespesa.innerHTML = '<option value="">Eu</option>' +
            APP.carteiras.map(c => `<option value="${c.usuarioId}">${escaparHtml(c.usuarioNome)}</option>`).join("") +
            '<option value="ambos">Ambos (dividir)</option>';
    }
}

function rotuloMes(chaveMes) {
    const [ano, mes] = chaveMes.split("-");
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[Number(mes) - 1]}/${ano}`;
}

/** Todos os meses ("YYYY-MM") de "mesInicial" até dezembro do mesmo ano. */
function mesesAteFimDoAno(mesInicial) {
    const [ano, mes] = mesInicial.split("-").map(Number);
    const meses = [];
    for (let m = mes; m <= 12; m++) meses.push(`${ano}-${String(m).padStart(2, "0")}`);
    return meses;
}

/** Filtro de pessoa/categoria (não de mês — usado tanto pras despesas
 *  reais quanto pras fixas projetadas, ver despesasFixasVirtuaisParaMes). */
function correspondeFiltroPessoaCategoria(d) {
    if (APP.filtros.usuarioId) {
        // Despesa compartilhada entra no filtro de qualquer uma das duas
        // pessoas (é metade de cada um), não só de quem registrou.
        const pertenceAoFiltro = String(d.usuarioId) === String(APP.filtros.usuarioId) || d.compartilhada;
        if (!pertenceAoFiltro) return false;
    }
    if (APP.filtros.categoria && d.categoria !== APP.filtros.categoria) return false;
    return true;
}

function aplicarFiltros() {
    return APP.despesas.filter(d => {
        if (APP.filtros.mes && d.dataDespesa.slice(0, 7) !== APP.filtros.mes) return false;
        return correspondeFiltroPessoaCategoria(d);
    });
}

/** 5º dia útil (seg-sex, sem calendário de feriados) do mês "mesChave"
 *  — mesma regra de quinto_dia_util() no banco (ver
 *  database/schema-fixas-quinto-dia-util.sql), usada aqui só pra
 *  estimar a data de exibição da projeção. */
function quintoDiaUtilISO(mesChave) {
    const [ano, mes] = mesChave.split("-").map(Number);
    let contador = 0;
    for (let dia = 1; dia <= 31; dia++) {
        const data = new Date(ano, mes - 1, dia);
        if (data.getMonth() !== mes - 1) break;
        const diaSemana = data.getDay();
        if (diaSemana >= 1 && diaSemana <= 5) {
            contador++;
            if (contador === 5) return `${mesChave}-${String(dia).padStart(2, "0")}`;
        }
    }
    return `${mesChave}-01`;
}

/** Despesas fixas ativas que ainda não têm lançamento real em
 *  "mesChave" (o cron só cria no 5º dia útil daquele mês — ver
 *  database/schema-fixas-quinto-dia-util.sql) — devolve uma "despesa"
 *  projetada pra cada uma, só pra exibição (nunca gravada, não pode
 *  ser editada/excluída). Assim o mês aparece completo no relatório
 *  mesmo antes do lançamento automático acontecer. */
function despesasFixasVirtuaisParaMes(mesChave) {
    if (!mesChave) return [];

    return APP.despesasFixas
        .filter(f => f.ativa
            && f.criadoEm.slice(0, 7) <= mesChave
            && !APP.despesas.some(d => d.despesaFixaId === f.id && d.dataDespesa.slice(0, 7) === mesChave))
        .map(f => ({
            id: `fixa-${f.id}-${mesChave}`,
            usuarioId: f.usuarioId,
            usuarioNome: f.usuarioNome,
            valor: f.valor,
            categoria: f.categoria,
            formaPagamento: f.formaPagamento,
            cartaoId: f.cartaoId,
            despesaFixaId: f.id,
            descricao: f.descricao,
            parcelaAtual: null,
            parcelaTotal: null,
            parcelaGrupoId: null,
            dataDespesa: quintoDiaUtilISO(mesChave),
            mensagemOriginal: f.descricao || "Despesa fixa ainda não lançada",
            confiancaIA: null,
            compartilhada: f.compartilhada,
            virtual: true
        }))
        .filter(correspondeFiltroPessoaCategoria);
}

/** Valor "de fato" de uma despesa no contexto do filtro de pessoa atual:
 *  metade, se for compartilhada e o filtro estiver numa pessoa específica
 *  (a outra metade é da outra pessoa); valor cheio nos demais casos
 *  (inclusive compartilhada sem filtro de pessoa — "Todos"). */
function valorEfetivo(despesa) {
    return APP.filtros.usuarioId && despesa.compartilhada ? despesa.valor / 2 : despesa.valor;
}

function renderizarDashboard() {
    // As despesas fixas projetadas só valem quando um mês específico
    // está selecionado (não dá pra projetar em cima de "Todos os meses").
    const lista = [...aplicarFiltros(), ...despesasFixasVirtuaisParaMes(APP.filtros.mes)]
        .sort((a, b) => b.dataDespesa.localeCompare(a.dataDespesa));
    renderizarKpis(lista);
    renderizarTabela(lista);
}

function renderizarKpis(lista) {
    const container = document.getElementById("kpisDespesas");
    if (!container) return;

    const total = lista.reduce((soma, d) => soma + valorEfetivo(d), 0);

    const porCategoria = new Map();
    for (const d of lista) porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + valorEfetivo(d));
    const categoriaTop = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0];

    // Com filtro de pessoa ativo, a lista já é só dela (dela sozinha +
    // metade das compartilhadas) — um tile só, no nome dela. Sem filtro
    // ("Todos"), um tile por pessoa, cada um já somando a própria metade
    // de toda despesa "Ambos" — mesma conta de quando filtra por ela,
    // só que pras duas ao mesmo tempo (nunca um bucket "Ambos" à parte,
    // senão o valor dela some do total de ninguém).
    const porPessoa = new Map();
    if (APP.filtros.usuarioId) {
        const nomeFiltro = APP.carteiras.find(c => String(c.usuarioId) === String(APP.filtros.usuarioId))?.usuarioNome ?? "-";
        porPessoa.set(nomeFiltro, total);
    } else {
        for (const c of APP.carteiras) {
            const totalPessoa = lista.reduce((soma, d) => {
                if (d.compartilhada) return soma + d.valor / 2;
                return String(d.usuarioId) === String(c.usuarioId) ? soma + d.valor : soma;
            }, 0);
            porPessoa.set(c.usuarioNome, totalPessoa);
        }
    }

    // Valor cheio (não a metade) de tudo que está marcado "Ambos" —
    // só informativo, não entra na soma dos tiles por pessoa (essa já
    // conta a metade de cada um separadamente).
    const totalCompartilhado = lista
        .filter(d => d.compartilhada)
        .reduce((soma, d) => soma + d.valor, 0);

    container.innerHTML = `
        <div class="stat-tile">
            ${statIcone("💰", "verde")}
            <div class="stat-label">Total no período</div>
            <div class="stat-valor">${formatarMoeda(total)}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🧾", "azul")}
            <div class="stat-label">Quantidade de gastos</div>
            <div class="stat-valor">${lista.length}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🏷️", "laranja")}
            <div class="stat-label">Maior categoria</div>
            <div class="stat-valor">${categoriaTop ? categoriaTop[0] : "-"}</div>
            <div class="stat-sublinha">${categoriaTop ? formatarMoeda(categoriaTop[1]) : ""}</div>
        </div>
        <div class="stat-tile">
            ${statIcone("🤝", "roxo")}
            <div class="stat-label">Gasto em conjunto</div>
            <div class="stat-valor">${formatarMoeda(totalCompartilhado)}</div>
            <div class="stat-sublinha">despesas marcadas como Ambos, valor cheio</div>
        </div>
        ${[...porPessoa.entries()].map(([nome, valor], indice) => `
            <div class="stat-tile">
                ${statIconePessoa(nome, indice)}
                <div class="stat-label">Total de ${escaparHtml(nome)}</div>
                <div class="stat-valor">${formatarMoeda(valor)}</div>
            </div>
        `).join("")}
    `;
}

/** Chave que identifica a forma de pagamento no seletor da tabela:
 *  crédito ganha uma opção por cartão ("credito:<id>"); as demais usam
 *  o próprio valor de forma_pagamento. */
function chaveFormaPagamento(d) {
    return d.formaPagamento === "crédito" && d.cartaoId ? `credito:${d.cartaoId}` : d.formaPagamento;
}

/** Opções do seletor de forma de pagamento — cartão de crédito não é
 *  mais uma coluna separada, é uma opção por cartão cadastrado aqui
 *  mesmo (ex.: "Nubank - Crédito"), pra já saber em qual fatura entra. */
function opcoesFormaPagamento() {
    return [
        { valor: "dinheiro", rotulo: "Dinheiro" },
        { valor: "débito", rotulo: "Débito" },
        { valor: "pix", rotulo: "PIX" },
        ...APP.cartoes.map(c => ({ valor: `credito:${c.id}`, rotulo: `${c.nome} - Crédito` })),
        { valor: "saque", rotulo: "Saque" },
        { valor: "outro", rotulo: "Outro" }
    ];
}

function renderizarTabela(lista) {
    const container = document.getElementById("listaDespesas");
    if (!container) return;

    if (lista.length === 0) {
        container.innerHTML = '<p class="alerta-vazio">Nenhuma despesa encontrada.</p>';
        return;
    }

    const opcoesPagamento = opcoesFormaPagamento();

    container.innerHTML = `
        <table class="tabela-despesas">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Forma de pagamento</th>
                    <th>Pessoa</th>
                    <th>Valor</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(d => {
                    if (d.virtual) {
                        return `
                        <tr class="linha-despesa-virtual" title="Despesa fixa ainda não lançada — entra de verdade no 5º dia útil do mês">
                            <td>${formatarDataBR(d.dataDespesa)}</td>
                            <td>${escaparHtml(d.descricao || d.mensagemOriginal)} <span class="badge-parcela">prevista</span></td>
                            <td>${escaparHtml(d.categoria)}</td>
                            <td>${escaparHtml(opcoesPagamento.find(op => op.valor === chaveFormaPagamento(d))?.rotulo ?? d.formaPagamento)}</td>
                            <td>${escaparHtml(d.compartilhada ? "Ambos (dividir)" : d.usuarioNome)}</td>
                            <td class="valor-cell">${formatarMoeda(valorEfetivo(d))}</td>
                            <td></td>
                        </tr>
                    `;
                    }

                    const chaveAtual = chaveFormaPagamento(d);
                    const opcaoFaltando = opcoesPagamento.some(op => op.valor === chaveAtual)
                        ? ""
                        : `<option value="${escaparHtml(chaveAtual)}" selected>${escaparHtml(d.formaPagamento)}</option>`;
                    return `
                    <tr>
                        <td>${formatarDataBR(d.dataDespesa)}</td>
                        <td title="${escaparHtml(d.mensagemOriginal)}">${escaparHtml(d.descricao || d.mensagemOriginal)}${d.parcelaTotal ? ` <span class="badge-parcela">${d.parcelaAtual}/${d.parcelaTotal}</span>` : ""}</td>
                        <td>
                            <select class="select-categoria-linha" data-id-despesa="${d.id}">
                                ${CATEGORIAS.map(c => `<option value="${c}"${c === d.categoria ? " selected" : ""}>${c}</option>`).join("")}
                            </select>
                        </td>
                        <td>
                            <select class="select-forma-pagamento-linha" data-id-despesa="${d.id}">
                                ${opcoesPagamento.map(op => `<option value="${op.valor}"${op.valor === chaveAtual ? " selected" : ""}>${escaparHtml(op.rotulo)}</option>`).join("")}
                                ${opcaoFaltando}
                            </select>
                        </td>
                        <td>
                            <select class="select-pessoa-linha" data-id-despesa="${d.id}">
                                ${APP.carteiras.map(c => `<option value="${c.usuarioId}"${!d.compartilhada && String(c.usuarioId) === String(d.usuarioId) ? " selected" : ""}>${escaparHtml(c.usuarioNome)}</option>`).join("")}
                                <option value="ambos"${d.compartilhada ? " selected" : ""}>Ambos (dividir)</option>
                            </select>
                        </td>
                        <td class="valor-cell">${formatarMoeda(valorEfetivo(d))}</td>
                        <td><button type="button" class="botao-excluir" data-id="${d.id}" title="Excluir">&times;</button></td>
                    </tr>
                `;
                }).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll(".botao-excluir").forEach(botao => {
        botao.addEventListener("click", () => aoExcluirDespesa(botao.dataset.id));
    });

    container.querySelectorAll(".select-pessoa-linha").forEach(select => {
        select.addEventListener("change", () => aoAlterarPessoaDespesa(select.dataset.idDespesa, select.value));
    });

    container.querySelectorAll(".select-forma-pagamento-linha").forEach(select => {
        select.addEventListener("change", () => aoAlterarFormaPagamentoDespesa(select.dataset.idDespesa, select.value));
    });

    container.querySelectorAll(".select-categoria-linha").forEach(select => {
        select.addEventListener("change", () => aoAlterarCategoriaDespesa(select.dataset.idDespesa, select.value));
    });
}

async function aoAlterarCategoriaDespesa(id, categoria) {
    const ok = await atualizarCategoriaDespesa(id, categoria);
    if (!ok) {
        alert("Não foi possível reatribuir a categoria da despesa. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = await buscarDespesas();
    renderizarDashboard();
}

async function aoAlterarFormaPagamentoDespesa(id, chave) {
    const [formaPagamento, cartaoId] = chave.startsWith("credito:")
        ? ["crédito", chave.slice("credito:".length)]
        : [chave, null];

    const ok = await atualizarFormaPagamentoDespesa(id, formaPagamento, cartaoId);
    if (!ok) {
        alert("Não foi possível reatribuir a forma de pagamento da despesa. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = await buscarDespesas();
    renderizarDashboard();
    renderizarCartoes();
}

async function aoAlterarPessoaDespesa(id, usuarioId) {
    const despesa = APP.despesas.find(d => String(d.id) === String(id));
    if (!despesa) return;

    const ok = await atualizarPessoaDespesa(despesa, usuarioId);
    if (!ok) {
        alert("Não foi possível reatribuir a despesa. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = await buscarDespesas();
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
}

async function aoExcluirDespesa(id) {
    if (!confirm("Excluir essa despesa?")) return;

    const ok = await excluirDespesa(id);
    if (!ok) {
        alert("Não foi possível excluir. Veja o console pra detalhes.");
        return;
    }

    APP.despesas = APP.despesas.filter(d => String(d.id) !== String(id));
    APP.carteiras = await buscarCarteiras();
    renderizarDashboard();
    renderizarCarteiras();
    renderizarResumo();
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBR(dataISO) {
    const [ano, mes, dia] = dataISO.split("-");
    return `${dia}/${mes}/${ano}`;
}

function escaparHtml(texto) {
    const div = document.createElement("div");
    div.textContent = String(texto ?? "");
    return div.innerHTML;
}
