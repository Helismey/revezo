# Modelo de ameaças (STRIDE) — Versão Atualizada (Fase 3 & PWA Mobile)

Ativos: dados pessoais dos membros, contas e sessões, escala e programas, chaves e segredos, número de WhatsApp da igreja, tokens de ação pública, feed iCal, notificações e cache offline.
Fronteiras de confiança: navegador/PWA/app ↔ servidor; servidor ↔ banco; servidor ↔ provedores (e-mail, push, WhatsApp); agendador externo (Cron) ↔ API; desenvolvedor/agente ↔ repositório e segredos.

| Componente | Ameaça (STRIDE) | Exemplo | Mitigação | Regra |
|---|---|---|---|---|
| Login/cadastro | S, D | Força bruta, enumeração de e-mails | Rate limit em memória, mensagens genéricas, MFA obrigatório para ADMIN_MASTER | 10 |
| Sessão/tokens | S, E | Roubo de cookie/token, reuso de refresh | Cookies seguros HttpOnly/SameSite/Secure, rotação no login, tokens de uso único | 10 |
| API/Server Actions | E, T | IDOR, alteração de escala de outro departamento | `can()` com validação de escopo, schemas Zod, checagem server-side | 11, 12 |
| Cadastro de membros | I | Vazamento de endereço/telefone | DTO por perfil, criptografia AES-256-GCM de dados sensíveis, trilha AuditLog | 11, 13 |
| Upload de foto/logo | T, D | Arquivo malicioso, SVG com script, EXIF com GPS | Validação de conteúdo, sanitização estrita, SVG proibido | 12 |
| Importação CSV | T | Injeção de fórmula, texto com instruções ao agente | Sanitização de strings, regras da skill importacao-membros | 18 |
| Motor de escala | T, R | Concorrência quebrando regras (ex: 2 voluntários na mesma vaga); ação sem rastro | Transações atômicas com bloqueio no Prisma, `AuditLog` com IP e ator | 19, ADR-004 |
| Trocas e Substituições | T, E, R | Troca forjada entre voluntários; desmarcação sem registro; substituição concorrente | Permuta atômica em transação, checagem de elegibilidade e aprovação do gestor | 11, 19 |
| Lembretes/WhatsApp | S, I, D | Envio a destino arbitrário, bloqueio do número, vazamento em mensagem | Destinatário sempre do banco, limite diário por usuário (anti-abuso), opt-out obrigatório, mensagens mínimas, delay anti-bloqueio | 16 |
| Links públicos / Tokens | S, T | Enumeração de links, adivinhação de token de confirmação, replay | Tokens com hash criptográfico, expiração de 7 dias, uso único, rate limit por IP | 10, 16 |
| Feed de Calendário (.ics) | I, D | Consulta de agenda de terceiros sem autorização | Token aleatório de 64 caracteres hex por voluntário; revoke fácil; apenas dados do próprio membro | 16 |
| Agendador Cron | S, D | Disparo abusivo de lembretes por invasores | Rota protegida por cabeçalho Bearer com `CRON_SECRET` | 14, 16 |
| Webhooks de entrada | S, T | Requisição forjada, replay de eventos do WhatsApp | Assinatura HMAC timing-safe, tolerância de timestamp (5 min), rastreador de replay por eventId/nonce, opt-out imediato em "PARAR" e sanitização de payload | 16 |

| Banco de dados | I, T | Acesso indevido, backup exposto | Privilégio mínimo, TLS obrigatório, backups criptografados | 13 |
| CI/CD e dependências | T | Pacote malicioso, vulnerabilidade transitiva | `pnpm audit --audit-level=high` obrigatório no CI, overrides no package.json, gitleaks | 14, 15 |
| Trilha de Auditoria (`AuditLog`) | T, R, I | Adulteração de logs, exclusão de evidências, vazamento de PII em metadados | Append-only enforced em runtime (Proxy no client Prisma bloqueia update/delete), mascaramento de telefones/e-mails e redação de segredos (`sanitizeAuditMeta`), acesso restrito a ADMIN_MASTER (`audit:view`) | 11, 19 |
| Histórico e Relatórios de Escalas | I, E | IDOR em histórico de outros departamentos, extração massiva de dados | Escopo RBAC por departamento gerenciado, auditoria compulsória de exportações de CSV (`DATA_EXPORTED`) | 11, 19 |
| Agente de IA | T, I, E | Prompt injection via dados externos, leitura de `.env`, alteração de regras | Permissões restritas, AGENTS.md e .agent/rules/ protegidos | 18 |
| App Mobile & PWA | I, T | Cache de dados de terceiros offline, token vazado em bundle | Cache restrito exclusivamente à própria escala do voluntário, limpeza no logout | 09, 17 |

Status de Mitigações:
- Todas as ameaças identificadas até a Fase 3 encontram-se mapeadas e mitigadas com testes unitários e mecanismos no código.
