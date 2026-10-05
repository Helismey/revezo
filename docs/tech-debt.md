# Dívida técnica

Prioridade = (Impacto + Risco) x (6 - Esforço). Escalas de 1 a 5.

| # | Item | Categoria | Impacto | Risco | Esforço | Prioridade | Plano |
|---|---|---|---|---|---|---|---|
| 1 | ~~Adaptador WhatsApp não oficial~~ | ~~Arquitetura~~ | ~~3~~ | ~~4~~ | ~~3~~ | ~~21~~ | ✅ **Resolvido em 02/10/2026** — Arquitetura multi-provedor plugável (`WhatsAppProvider`): Meta WhatsApp Cloud API (Oficial via Graph API), Evolution API (Baileys) e Z-API com detecção automática e fallback em simulação mascarada (LGPD). Detalhes: ADR-003. |
| 2 | ~~Limites e pausa de banco gratuito~~ | ~~Infraestrutura~~ | ~~3~~ | ~~4~~ | ~~2~~ | ~~28~~ | ✅ **Resolvido em 01/10/2026** — Backup diário criptografado (AES-256 via OpenSSL) no GitHub Actions (`database-backup.yml`), scripts de teste de restauração (`test-restore.sh`/`.ps1`) e endpoint de keepalive anti-hibernação (`/api/cron/keepalive`). Detalhes: ADR-014. |
| 3 | Cobertura de testes do motor | Testes | 4 | 4 | 2 | 32 | Testes obrigatórios desde a Fase 1 |
| 4 | ~~GHSA-82fw — vitest path traversal (moderate)~~ | ~~Segurança~~ | ~~3~~ | ~~3~~ | ~~1~~ | ~~18~~ | ✅ **Resolvido em 30/09/2026** — atualizado para vitest ^5.0.2 (correção em >=4.1.11). Detalhes: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) |
| 5 | GHSA-vfj7 — braces stack exhaustion (High) | Segurança | 2 | 2 | 2 | 16 | Dependência transitiva de desenvolvimento/build via `tailwindcss`. Não afeta runtime do servidor nem usuários finais. Aguardando patch upstream oficial do mantenedor de `braces`. |

Atualizar a cada fase com /divida-tecnica.

