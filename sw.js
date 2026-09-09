/**
 * ==========================================================
 * Service Worker — cache de arquivos estáticos
 * ==========================================================
 * Só acelera a abertura do app (HTML/CSS/JS locais). Chamadas ao
 * Supabase e a CDN são de outra origem e nunca passam por aqui — o
 * fetch abaixo só intercepta GET same-origin, então dados continuam
 * sempre vindo da rede.
 */

const CACHE_NAME = "despesas-cache-v202609092000";

const ARQUIVOS_ESTATICOS = [
    "./",
    "index.html",
    "manifest.json",
    "css/style.css",
    "css/componentes.css",
    "js/config/supabase.js",
    "js/core/state.js",
    "js/core/icones.js",
    "js/core/tema.js",
    "js/core/app.js",
    "js/services/auth.js",
    "js/services/despesas.js",
    "js/services/carteiras.js",
    "js/services/cartoes.js",
    "js/services/investimentos.js",
    "js/services/despesasFixas.js",
    "js/services/insights.js",
    "js/ui/login.js",
    "js/ui/perfil.js",
    "js/ui/modal.js",
    "js/ui/dashboard.js",
    "js/ui/resumo.js",
    "js/ui/projecao.js",
    "js/ui/insights.js",
    "js/ui/abas.js",
    "js/ui/carteiras.js",
    "js/ui/cartoes.js",
    "js/ui/investimentos.js",
    "js/ui/despesasFixas.js",
    "icons/icon-192x192.png",
    "icons/icon-512x512.png"
];

self.addEventListener("install", evento => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ARQUIVOS_ESTATICOS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", evento => {
    evento.waitUntil(
        caches.keys()
            .then(nomes => Promise.all(
                nomes.filter(nome => nome !== CACHE_NAME).map(nome => caches.delete(nome))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", evento => {
    const requisicao = evento.request;

    // Só GET same-origin: deixa Supabase, CDN e afins irem direto pra
    // rede, sem cache — dados precisam sempre vir atualizados.
    if (requisicao.method !== "GET" || new URL(requisicao.url).origin !== self.location.origin) {
        return;
    }

    evento.respondWith(
        caches.match(requisicao).then(respostaCache => {
            const buscaRede = fetch(requisicao)
                .then(respostaRede => {
                    if (respostaRede && respostaRede.ok) {
                        const copia = respostaRede.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(requisicao, copia));
                    }
                    return respostaRede;
                })
                .catch(() => respostaCache);

            // Cache-first pra abrir rápido/offline; atualiza em segundo
            // plano quando a rede responde.
            return respostaCache || buscaRede;
        })
    );
});
