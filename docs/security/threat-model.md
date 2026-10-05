# Modelo de Ameaças (STRIDE) — Revezo

**Data de Revisão:** 05/10/2026  
**Versão:** 2.0 (Fase 3.5 — PWA, Multi-Igreja, Hierarquia Eclesiástica & Concorrência)  
**Metodologia:** STRIDE (Microsoft Threat Modeling) & Avaliação de Risco (Probabilidade × Impacto)  
**Referência:** Skill `modelagem-de-ameacas`, Regras de Segurança `10` a `20`, ADRs `004` a `019`.

---

## 1. Escopo e Inventário de Ativos

### 1.1 Ativos Protegidos (Assets)

| Nível de Criticidade | Ativo | Descrição e Sensibilidade |
|---|---|---|
| 🔴 **Crítico** | **Dados Pessoais dos Membros (LGPD)** | Nomes, e-mails, telefones primários/secundários, endereços, contatos de emergência e histórico médico/observações pastorais. Criptografados com AES-256-GCM. |
| 🔴 **Crítico** | **Credenciais e Chaves de Sessão** | Senhas (hash scrypt com salt aleatório), segredos TOTP de MFA, cookies de sessão HttpOnly/SameSite/Secure, refresh tokens com rotação. |
| 🔴 **Crítico** | **Segredos de Infraestrutura e Integração** | `AUTH_SECRET`, `CRON_SECRET`, chaves VAPID, tokens de provedores WhatsApp (Meta Cloud API, Evolution, Z-API) e chaves Resend. |
| 🟡 **Alto** | **Integridade das Escalas e Invariantes** | Ausência de sobreposição de horário, limite estrito de no máximo 2 escalas/dia, respeito a indisponibilidades e fluxo de aprovação pastoral. |
| 🟡 **Alto** | **Trilha de Auditoria (`AuditLog`)** | Registros de criação, edição, aprovação, trocas e acessos administrativos. Append-only obrigatório, sem PII nos metadados. |
| 🟡 **Alto** | **Isolamento Multi-Congregação (Multi-Tenant)** | Garantia de que pastores, anciãos, gestores e membros acessem exclusivamente os dados da congregação a que pertencem. |
| 🟢 **Médio** | **Links de Confirmação e Feeds de Calendário** | Tokens de uso único (7 dias) para confirmação de presença e tokens de 64 caracteres hex para assinatura de feed `.ics`. |

---

## 2. Fronteiras de Confiança e Diagrama de Fluxo de Dados (DFD)

```mermaid
graph TD
    subgraph Zona_Desconfiada [Ambiente Externo / Cliente Não Confiável]
        User[Voluntário / Gestor / Navegador Web / PWA / App Capacitor]
        Attacker[Atacante Externo / Botnet]
        ExternalCalendar[Cliente de Calendário Google/Apple]
    end

    subgraph Fronteira_DMZ [Fronteira de Confiança 1: Borda e Aplicação Next.js]
        WAF[Cabeçalhos HTTP / CSP / HSTS / CORS]
        AuthGuard[Middleware de Sessão & Rate Limiter Híbrido]
        RouteHandlers[App Router / Server Actions com Zod & can()]
    end

    subgraph Fronteira_Servicos [Fronteira de Confiança 2: Serviços e Domínio]
        DomainEngine[Motor de Escala Puro @revezo/domain]
        NotificationDispatcher[Despachante de Notificações Multi-Canal]
        TokenService[Serviço de Tokens Criptográficos]
    end

    subgraph Fronteira_Persistencia [Fronteira de Confiança 3: Dados e Infraestrutura]
        PrismaORM[Prisma Client com Proxy Append-Only]
        PostgreSQL[(PostgreSQL Supabase/Neon com TLS)]
        RedisCache[(Upstash Redis REST / Memória Local)]
    end

    subgraph Fronteira_Provedores [Fronteira de Confiança 4: Provedores Externos]
        WhatsAppProvider[Meta Cloud API / Evolution / Z-API]
        ResendEmail[Resend E-mail API]
        PushService[FCM / Apple APNS / Web Push VAPID]
    end

    User -->|HTTPS + Cookie HttpOnly| WAF
    Attacker -.->|Tentativa de Força Bruta / Injeção| WAF
    ExternalCalendar -->|GET /api/calendario/token| WAF
    WAF --> AuthGuard
    AuthGuard --> RedisCache
    AuthGuard --> RouteHandlers
    RouteHandlers -->|Validação Zod + RBAC can()| DomainEngine
    RouteHandlers --> TokenService
    RouteHandlers --> NotificationDispatcher
    NotificationDispatcher --> WhatsAppProvider
    NotificationDispatcher --> ResendEmail
    NotificationDispatcher --> PushService
    DomainEngine --> PrismaORM
    TokenService --> PrismaORM
    PrismaORM -->|Transações com Advisory Lock / TLS| PostgreSQL
```

---

## 3. Matriz de Ameaças STRIDE e Avaliação de Risco

A avaliação adota a matriz de Risco: **Probabilidade** (Baixa=1, Média=2, Alta=3) × **Impacto** (Baixo=1, Médio=2, Alto=3):
- **Crítico (7 a 9)** | **Alto (5 a 6)** | **Médio (3 a 4)** | **Baixo (1 a 2)**

| ID | Categoria STRIDE | Componente Afetado | Descrição da Ameaça e Vetor de Ataque | Risco | Mitigação Implementada no Revezo | Verificação / Evidência |
|---|:---:|---|---|:---:|---|---|
| **T01** | **Spoofing** | Autenticação & Sessão | Ataque de força bruta contra senhas ou roubo de cookie de sessão para se passar por outro membro. | **Alto** (6) | Hash `scrypt` com salting individual; Rate limiting no login (Upstash Redis + fallback em memória); Cookies `HttpOnly`, `SameSite=Strict`, `Secure`; rotação de token no login. | `crypto-and-auth.test.ts`, `auth-routes.test.ts` |
| **T02** | **Spoofing** | Acesso Administrativo | Sequestro de conta de `ADMIN_MASTER` com privilégios irrestritos no sistema. | **Crítico** (9) | MFA/TOTP obrigatório compulsório para `ADMIN_MASTER`; bloqueio de desativação; alerta sonoro/visual obrigatório; trava contra auto-rebaixamento. | `auth-security-rules.test.ts`, ADR-006 |
| **T03** | **Tampering** | Motor de Escala & Concorrência | Dois gestores escalando a mesma pessoa em horários simultâneos ou burlando o limite diário de 2 escalas por dia. | **Crítico** (9) | Validação atômica em transação do Prisma com rechecagem estrita dentro do lock (`wouldExceedDailyLimit`, `hasTimeOverlap`); teste de concorrência com chamadas paralelas. | `concurrency.test.ts`, ADR-004 |
| **T04** | **Tampering** | Trilha de Auditoria (`AuditLog`) | Invasor ou gestor malicioso alterando ou apagando evidências de ações realizadas no sistema. | **Crítico** (9) | Proxy no Prisma Client que intercepta e rejeita chamadas `update`, `delete`, `updateMany`, `deleteMany` na tabela `AuditLog` (append-only enforced). | `audit-and-history.test.ts`, Regra 19 |
| **T05** | **Tampering** | Webhooks de Notificação | Atacante forjando eventos de webhook ou efetuando replay de confirmações do WhatsApp. | **Alto** (6) | Assinatura HMAC timing-safe (`verifyWebhookSignature`); janela máxima de tolerância de timestamp (5 min); rastreador de replay por `eventId`/nonce com deduplicação. | `webhook-security.test.ts`, `webhook-whatsapp.test.ts` |
| **T06** | **Repudiation** | Trocas e Escalações | Voluntário ou gestor negando ter solicitado troca, desmarcado escala ou aprovado escala irregular. | **Médio** (4) | Todo evento registra `actorId`, `ip`, `targetId`, `result` e metadados higienizados em `AuditLog`; trilha auditável por departamento e congregação. | `audit.ts`, `audit-and-history-routes.test.ts` |
| **T07** | **Information Disclosure** | Cadastro de Membros | Vazamento de dados de contato ou endereço pessoal de voluntários (violação da LGPD). | **Crítico** (9) | Campos sensíveis criptografados em repouso com AES-256-GCM; DTOs sanitizados de acordo com o papel do requisitante; voluntários comuns não veem dados pessoais de outros membros. | `aes.ts`, `crypto-and-auth.test.ts`, Regra 13 |
| **T08** | **Information Disclosure** | Feed de Calendário (.ics) | Consulta da escala de outros voluntários por enumeração de URLs de calendário. | **Alto** (6) | Token criptográfico aleatório de 64 caracteres hex; revogação instantânea com rotação de token; endpoint restrito estritamente às escalas do titular do token. | `calendar.test.ts`, ADR-011 |
| **T09** | **Information Disclosure** | Multi-Congregação (IDOR) | Pastor ou Ancião de uma congregação acessando histórico, membros ou escalas de outra congregação. | **Crítico** (9) | Escopo validado na função pura `can()` e filtragem obrigatória de `churchId` nas consultas Prisma; pastors restritos aos IDs em `pastorChurchIds`. | `hierarchy-and-roles.test.ts`, `authz-matrix.test.ts` |
| **T10** | **Denial of Service** | Cron de Lembretes | Chamada repetida ao endpoint `/api/cron/reminders` para esgotar cota de mensagens e travar o servidor. | **Alto** (6) | Autenticação via `CRON_SECRET` com `timingSafeEqual` e fail-closed em produção; lógica idempotente via `NotificationLog` que impede envios duplicados. | `reminders/route.ts`, `keepalive.test.ts` |
| **T11** | **Denial of Service** | Consultas N+1 no Banco Gratuito | Degradação do pool de conexões do Neon/Supabase gratuito por consultas não otimizadas em relatórios. | **Médio** (4) | Resolução em lote via `IN (...)` e `include`/`select` consolidados; testes de integração automatizados que garantem teto máximo de 2 a 4 queries por rota. | `performance-queries-n1.test.ts`, Skill `testes-desempenho` |
| **T12** | **Elevation of Privilege** | Hierarquia Eclesiástica | Ancião promovendo a si mesmo ou a outro membro para `PASTOR` ou `ADMIN_MASTER`. | **Crítico** (9) | Regra de hierarquia estrita: Anciãos só podem nomear cargos estritamente abaixo do seu nível hierárquico (não podem nomear outros Anciãos, Pastores ou Admins). | `hierarchy-and-roles.test.ts`, `membros/route.ts` |
| **T13** | **Elevation of Privilege** | Upload de Mídia / SSRF | Envio de arquivos executáveis, SVGs com XSS ou URLs maliciosas em avatares e comprovantes. | **Alto** (6) | Upload de arquivos proibido no servidor da aplicação; fotos aceitam apenas URLs HTTPS com formato validado por Zod; SVGs bloqueados. | `owasp-web-security.test.ts`, Regra 12 |
| **T14** | **Tampering / AI** | Prompt Injection via Agente IA | Injeção de instruções maliciosas via planilha CSV importada ou texto de membro para alterar código ou regras. | **Crítico** (9) | Bloqueio de alteração e leitura de arquivos sensíveis (`AGENTS.md`, `.agent/**`, `.env*`) por gatilhos de dados externos; sanitização estrita de strings CSV. | `.agent/rules/18-seg-agente-ia.md` |

---

## 4. Plano de Verificação e Guardrails de Segurança

Para assegurar que nenhuma alteração futura reintroduza as ameaças modeladas:

1. **Execução Automática no CI (`.github/workflows/ci.yml`):**
   - Matriz de Autorização RBAC completa (`pnpm test:matrix`).
   - Testes de Concorrência e Corridas (`pnpm test:concurrency`).
   - Testes de Desempenho e Prevenção de N+1 (`pnpm test:perf`).
   - Varredura de Dependências (`pnpm audit --audit-level=high`).
2. **Varredura Contínua de Segredos (`.github/workflows/security.yml`):**
   - Gitleaks em todo o histórico de commits (`fetch-depth: 0`).
   - CodeQL estático para detecção de falhas de segurança OWASP.
3. **Auditoria Pré-Release (`docs/security/checklist-pre-release.md`):**
   - Verificação mandatória antes da publicação de cada versão para produção.
