/**
 * ==========================================================
 * UI de Projeção de Saldo
 * ==========================================================
 * Estimativa simples dos próximos meses, 100% client-side (sem IA,
 * sem fetch próprio — só lê de APP): parte do saldo atual das
 * carteiras e subtrai, mês a mês, os gastos já previstos (despesas
 * já cadastradas nesse mês — inclui parcelas futuras já agendadas —
 * mais uma estimativa das despesas fixas ativas que ainda não foram
 * lançadas naquele mês, pra não contar duas vezes o mês corrente).
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

        const saidaDoMes = gastosReais + estimativaFixas;
        saldoAcumulado -= saidaDoMes;

        linhas.push({ mes: chave, saida: saidaDoMes, saldo: saldoAcumulado });
    }

    return linhas;
}

function aoAbrirProjecao() {
    const linhas = projetarSaldo(6);

    abrirModal(`
        <h2>📈 Projeção de saldo</h2>
        <p class="descricao-campo">Estimativa pros próximos 6 meses: saldo atual menos as saídas já previstas (parcelas já agendadas + despesas fixas ativas). Não inclui gastos novos que ainda vão surgir.</p>
        <table class="tabela-despesas">
            <thead>
                <tr><th>Mês</th><th>Saída estimada</th><th>Saldo projetado</th></tr>
            </thead>
            <tbody>
                ${linhas.map(l => `
                    <tr>
                        <td>${rotuloMes(l.mes)}</td>
                        <td class="valor-cell">${formatarMoeda(l.saida)}</td>
                        <td class="valor-cell" style="color:${l.saldo < 0 ? "var(--cor-erro)" : "var(--cor-primaria)"}">${formatarMoeda(l.saldo)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `);
}
