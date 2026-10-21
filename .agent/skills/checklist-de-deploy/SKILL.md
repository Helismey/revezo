---
name: checklist-de-deploy
description: "Use antes de publicar uma versão: verificação pré-deploy, deploy, pós-deploy e gatilhos de rollback."
---

# Checklist de deploy

Usar `docs/deploy-checklist.md` como base e adaptar: se houver migration de banco, adicionar backup e teste da migration em cópia; se mudar template de notificação, testar envio em número de teste; se mudar cron, validar idempotência dos lembretes.

Definir os gatilhos de rollback ANTES de publicar (taxa de erro, login falhando, lembretes não saindo, escala com conflito).
