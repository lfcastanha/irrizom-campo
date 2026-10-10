// Service worker do IRRIZOM Campo: faz o app abrir sem internet.
// Os dados (Supabase) nunca passam por aqui; a fila offline fica no IndexedDB.
// Ao publicar uma versão com mudanças grandes, troque o número abaixo.
const CACHE = 'irrizom-campo-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/login', '/manifest.webmanifest']).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'precache' && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.add(u).catch(() => {})))),
    );
  }
});

function guardar(req, res) {
  if (res && res.ok && !res.redirected) {
    const copia = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copia));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: tenta a rede (versão nova); sem sinal, usa a cópia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => guardar(url.pathname, res))
        .catch(async () =>
          (await caches.match(url.pathname)) ||
          (await caches.match(url.pathname + '.html')) ||
          (await caches.match('/')) ||
          Response.error(),
        ),
    );
    return;
  }

  // Arquivos com versão no nome (JS/CSS) e ícones: usa a cópia guardada primeiro.
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => guardar(req, res))));
    return;
  }

  // Demais (dados de navegação do Next): rede primeiro, cópia como reserva.
  e.respondWith(
    fetch(req)
      .then((res) => guardar(req, res))
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  );
});
