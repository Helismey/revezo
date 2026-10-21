---
name: seguranca-mobile-capacitor
description: "Use ao empacotar o app com Capacitor ou construir cliente mobile: armazenamento seguro, deep links, cache offline, lojas."
---

# Segurança mobile

Aplicar a rule 17.

- Tokens em Keychain/Keystore (plugin de armazenamento seguro), nunca em `localStorage`.
- Bundle sem segredos; variáveis públicas só.
- Deep links: validar parâmetros; abrir tela que chama a API com autenticação.
- Cache offline: apenas a escala do próprio usuário; limpar no logout.
- Bloqueio opcional por biometria; versão mínima com atualização forçada.
- Lojas: política de privacidade e declaração de dados coletados corretas.
- Testar em dispositivo real: perda de rede, token expirado, revogação de dispositivo.
