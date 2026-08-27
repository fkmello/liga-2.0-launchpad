// Kill-switch Service Worker autodestrutivo.
// Qualquer browser que ainda tenha um SW antigo registrado em /sw.js
// vai baixar este arquivo na próxima checagem de update, ativar,
// desregistrar a si mesmo, limpar todos os caches e recarregar a aba.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await self.caches.keys();
        await Promise.all(keys.map((k) => self.caches.delete(k)));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => {
          if ('navigate' in client) {
            client.navigate(client.url);
          }
        });
      } catch (e) {}
    })()
  );
});

self.addEventListener('fetch', () => {
  // Não intercepta nada: deixa tudo ir direto para a rede.
});
