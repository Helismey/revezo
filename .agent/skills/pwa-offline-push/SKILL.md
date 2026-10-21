---
name: pwa-offline-push
description: "Use ao configurar PWA: manifest, service worker, cache offline da própria escala e Web Push."
---

# PWA, offline e push

- Manifest com nome, ícones (incluindo maskable), cores da igreja e `display: standalone`.
- Service worker: cache da casca do app e da "minha escala" (apenas do usuário logado); nunca cachear respostas com dados de outros membros; limpar cache no logout.
- Web Push com VAPID: assinatura por dispositivo, remoção ao revogar, chave privada só no servidor. No iPhone o push exige o app instalado na tela inicial; explicar isso na interface.
- Atualização do service worker com aviso "Nova versão disponível".
- Testar offline, atualização e permissão de notificação negada (fallback por e-mail).
