/**
 * ==========================================================
 * Serviço de Insights Financeiros
 * ==========================================================
 * Chama a Edge Function insights-financeiros, que analisa os gastos
 * recentes do casal com IA e devolve um resumo + dicas de onde
 * economizar (ver supabase/functions/insights-financeiros/index.ts).
 */
async function buscarInsightsFinanceiros() {
    const { data, error } = await supabaseClient.functions.invoke("insights-financeiros", {
        body: {}
    });

    if (error) {
        console.error("Falha ao chamar insights-financeiros:", error);
        return { ok: false, mensagem: "Falha ao gerar a análise. Veja o console pra detalhes." };
    }

    if (data?.error) {
        return { ok: false, mensagem: data.error };
    }

    return { ok: true, resumo: data.resumo, dicas: data.dicas ?? [] };
}
