/**
 * ==========================================================
 * UI de Projeção de Saldo
 * ==========================================================
 * Estimativa simples dos próximos meses, 100% client-side (sem IA,
 * sem fetch próprio — só lê de APP): parte do saldo atual das
 * carteiras e, mês a mês, soma os ganhos esperados e subtrai as
 * saídas já previstas.
 *
 * Saída: despesas já cadastradas nesse mês (inclui parcelas futuras
 * já agendadas) mais uma estimativa das despesas fixas ativas que
 * ainda não foram lançadas naquele mês.
 *
 * Entrada: só a estimativa dos salários ativos ainda não efetivados
 * naquele mês (ver aba Carteiras) — depósitos já efetivados NÃO
 * entram de novo aqui, porque já estão refletidos no saldo atual das
 * carteiras (todo depósito manual/efetivado ajusta o saldo na hora,
 * sem data futura, diferente de uma despesa parcelada no crédito).
 *
 * Não é fluxo de caixa exato (não modela fechamento/vencimento real
 * de fatura de cartão) — é só uma tendência aproximada.
 */

function registrarProjecao() {
    const botao = document.getElementById("btnAbrirProjecao");
    if (botao) botao.addEventListener("click", aoAbrirProjecao);
}

function projetarSaldo(qtdMeses) {
    const saldoAtual = APP.carteiras.reduce((soma, c) => soma + c.saldo, 0);
    const hoje = new Date();

    const linhas = [];
    let saldoAcumulado = saldoAtual;

    for (let i = 0; i < qtdMeses; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        const chave = d.toISOString().slice(0, 7);

        const gastosReais = APP.despesas
            .filter(x => x.dataDespesa.slice(0, 7) === chave)
            .reduce((soma, x) => soma + x.valor, 0);

        const estimativaFixas = APP.despesasFixas
            .filter(f => f.ativa)
            .reduce((soma, f) => {
                const jaLancada = APP.despesas.some(x => x.despesaFixaId === f.id && x.dataDespesa.slice(0, 7) === chave);
                return jaLancada ? soma : soma + f.valor;
            }, 0);

        const estimativaSalarios = APP.salarios
            .filter(s => s.ativo)
            .reduce((soma, s) => {
                const jaEfetivado = APP.movimentosCarteira.some(m => m.salarioId === s.id && m.criadoEm.slice(0, 7) === chave);
                return jaEfetivado ? soma : soma + s.valor;
            }, 0);

        const saidaDoMes = gastosReais + estimativaFixas;
        const entradaDoMes = estimativaSalarios;
        saldoAcumulado += entradaDoMes - saidaDoMes;

        linhas.push({ mes: chave, entrada: entradaDoMes, saida: saidaDoMes, saldo: saldoAcumulado });
    }

    return linhas;
}

function aoAbrirProjecao() {
    const linhas = projetarSaldo(6);

    abrirModal(`
        <h2>📈 Projeção de saldo</h2>
        <p class="descricao-campo">Estimativa pros próximos 6 meses: saldo atual mais os salários ainda não efetivados, menos as saídas já previstas (parcelas já agendadas + despesas fixas ativas). Não inclui gastos ou ganhos novos que ainda vão surgir.</p>
        <table class="tabela-despesas">
            <thead>
                <tr><th>Mês</th><th>Entrada estimada</th><th>Saída estimada</th><th>Saldo projetado</th></tr>
            </thead>
            <tbody>
                ${linhas.map(l => `
                    <tr>
                        <td>${rotuloMes(l.mes)}</td>
                        <td class="valor-cell">${formatarMoeda(l.entrada)}</td>
                        <td class="valor-cell">${formatarMoeda(l.saida)}</td>
                        <td class="valor-cell" style="color:${l.saldo < 0 ? "var(--cor-erro)" : "var(--cor-primaria)"}">${formatarMoeda(l.saldo)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `);
}
