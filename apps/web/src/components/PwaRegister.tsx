'use client';

import { useEffect, useState } from 'react';

export function clearClientUserCache() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_USER_CACHE' });
  }
}

export function PwaRegister() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerWorker = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Se já houver um worker aguardando ativação (ex: aba aberta há tempo)
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setHasUpdate(true);
          }

          // Escuta quando uma nova versão for detectada e instalada
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setWaitingWorker(newWorker);
                  setHasUpdate(true);
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[PWA] Falha ao registrar Service Worker:', error);
        });
    };

    if (document.readyState === 'complete') {
      registerWorker();
    } else {
      window.addEventListener('load', registerWorker);
      return () => window.removeEventListener('load', registerWorker);
    }
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ action: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  if (!hasUpdate) {
    return null;
  }

  return (
    <aside
      aria-label="Atualização do sistema"
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 p-4 bg-primary text-white rounded-card shadow-xl border border-white/20 flex flex-col sm:flex-row items-start sm:items-center gap-3 animate-fade-in"
    >
      <div className="text-xs">
        <p className="font-semibold text-sm">Nova versão disponível</p>
        <p className="opacity-90">Uma atualização do Revezo está pronta para uso.</p>
      </div>
      <button
        type="button"
        onClick={handleUpdate}
        className="px-3.5 py-1.5 bg-white text-primary text-xs font-bold rounded-control hover:bg-neutral-light transition-colors min-h-touch self-end sm:self-center"
      >
        Atualizar agora
      </button>
    </aside>
  );
}
