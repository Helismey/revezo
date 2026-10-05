const CACHE_NAME = 'revezo-v1';
const OFFLINE_URL = '/offline';

// Recursos estáticos fundamentais cacheados na instalação
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de versões antigas do cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições de rede
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Não intercepta requisições não-GET, nem chamadas de API de mutação ou externas
  if (request.method !== 'GET') {
    return;
  }

  // 1. Assets estáticos do Next.js e imagens: Cache First com fallback de rede
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Páginas de navegação (HTML): Network First com fallback de Cache ou Offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Atualiza o cache da página se foi bem-sucedido
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Cacheia apenas rotas permitidas para visualização offline do próprio membro (Rule 09/17)
              if (url.pathname === '/' || url.pathname.startsWith('/minha-escala') || url.pathname.startsWith('/perfil')) {
                cache.put(request, responseToCache);
              }
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Fallback para cache existente
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Se não houver cache da página, exibe a página offline
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('Sem conexão com a internet', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }
});

// Evento de Push Notification do Navegador (Web Push)
self.addEventListener('push', (event) => {
  let data = { title: 'Revezo', body: 'Você tem uma atualização na sua escala.', url: '/minha-escala' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/minha-escala',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/minha-escala';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Mensagens do cliente (atualizações e limpeza de sessão)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // Atualização do Service Worker para nova versão
  if (event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Limpeza de cache no logout (orientado pela Rule 17 e LGPD)
  if (event.data.action === 'CLEAR_USER_CACHE') {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((keys) => {
        keys.forEach((request) => {
          const url = new URL(request.url);
          // Limpa rotas dinâmicas de usuário preservando assets estáticos
          if (url.pathname.startsWith('/minha-escala') || url.pathname.startsWith('/perfil')) {
            cache.delete(request);
          }
        });
      });
    });
  }
});
