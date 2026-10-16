# Auditoria Técnica e Arquitetural — Revezo (`escala-igreja`)

**Data da auditoria:** 16/10/2026  
**Escopo:** Monorepo completo (`apps/web`, `packages/domain`, `packages/contracts`, `packages/db`, `.github/workflows`, `docs/` e `.agent/rules/`)  
**Modo de execução:** Somente leitura (nenhum arquivo de código-fonte, configuração ou banco de dados foi alterado)

---

## 0. Mapeamento Estrutural do Projeto

Antes da avaliação, toda a árvore do monorepo foi inspecionada:

- **Orquestração e Raiz**: Monorepo gerenciado com `pnpm@9.15.0` (`pnpm-workspace.yaml`) e Turborepo (`turbo.json`), TypeScript estrito compartilhado (`tsconfig.base.json`), Vitest na raiz (`vitest.config.mjs`), Playwright (`playwright.config.ts`) e PostgreSQL local via `docker-compose.yml`.
- **`packages/domain` (28 módulos puros + 24 arquivos de teste)**:
  - *Motor de escala (`src/scheduling/`)*: `conflict.ts`, `daily-limit.ts`, `availability.ts`, `eligibility.ts`, `ranking.ts`, `auto-scheduler.ts`, `auto-substitution.ts`, `swap-rules.ts`, `cloning.ts`, `recurrence.ts`, `overload-detector.ts`.
  - *Autorização e Escopo (`src/authz/`)*: `can.ts` (38 ações RBAC + hierarquia eclesiástica), `scope.ts` (filtros anti-IDOR), `sanitization.ts`.
  - *Autenticação e Criptografia (`src/auth/`, `src/crypto/`)*: `password.ts` (`scrypt`), `session.ts`, `totp.ts` (RFC 6238), `action-token.ts`, `app-token.ts`, `rate-limiter.ts` (`InMemoryRateLimiter` + `HybridRateLimiter` Upstash REST), `aes.ts` (AES-256-GCM).
  - *Notificações, Calendário, LGPD, Tema e Segurança Web*: `reminder-calculator.ts`, `message-templates.ts`, `webhook-security.ts`, `ics-generator.ts`, `profile.ts`, `contrast.ts`, `web-security.ts`, `menu.ts`.
- **`packages/contracts` (12 schemas Zod)**: Contratos compartilhados para `auth`, `member`, `department`, `program`, `scheduling`, `availability`, `swap`, `notification`, `action-token`, `audit`, `report` e `church`.
- **`packages/db` (Prisma 5.22 + Persistência + Auditoria)**:
  - `prisma/schema.prisma` (420 linhas): **9 enums** (`GlobalRole`, `AccountStatus`, `DepartmentRole`, `AssignmentStatus`, `SwapStatus`, `AvailabilityKind`, `ChannelName`, `ReminderKind`, `TokenPurpose`) e **20 models** (`ChurchSettings`, `Church`, `PastorChurch`, `User`, `Department`, `DepartmentFunction`, `DepartmentMember`, `MemberFunction`, `Program`, `ProgramDepartment`, `ProgramSlot`, `Assignment`, `Availability`, `NotificationLog`, `PushSubscription`, `RefreshToken`, `ActionToken`, `AuditLog`, `FeatureFlag`, `SwapRequest`).
  - `prisma/migrations/`: 3 migrations SQL (`20261001000000_init_schema`, `20261001010000_multi_church_and_roles`, `20261001020000_minor_protection_and_indexes`).
  - `src/client.ts` (68 linhas): Singleton do Prisma com Proxy (`wrapClientWithAuditGuard`) que bloqueia `update`, `updateMany`, `upsert`, `delete` e `deleteMany` em `AuditLog`.
  - `src/audit.ts` (581 linhas): Mascaramento de PII, sanitização recursiva de metadados, consulta paginada de auditoria e histórico de escalas.
  - `src/transactions.ts` (4.808 linhas): Monólito com todas as transações e consultas de aplicação.
- **`apps/web` (Next.js 15.5.15 App Router, React 19, Tailwind CSS, PWA e Capacitor 6)**:
  - **21 páginas** (`src/app/**/page.tsx`), **16 Client Components de página** (`*Client.tsx`), **12 componentes compartilhados** (`src/components/`), **5 Server Actions** (`handleLogout` em `layout.tsx:94`, `confirmAction` e `declineAction` duplicadas em `page.tsx:166-193` e `minha-escala/page.tsx:50-88`) e **48 rotas de API** (`src/app/api/**/route.ts`).
  - **Notificações (`src/services/notifications/`)**: `dispatcher.ts`, `swap-and-sub-notifications.ts`, canais (`push-channel.ts`, `email-channel.ts`, `whatsapp-channel.ts`, `sms-channel.ts`) e 4 provedores WhatsApp (`evolution`, `zapi`, `meta-cloud`, `simulation`).
  - **PWA & Mobile**: `public/sw.js`, `public/manifest.json`, `capacitor.config.ts`, `src/lib/capacitor-adapter.ts`, `src/lib/capacitor-push.ts` e projetos nativos `android/` e `ios/`.
- **Jobs/Cron e Pipelines**:
  - `apps/web/vercel.json`: `/api/cron/keepalive` (`0 3 * * *`) e `/api/cron/reminders` (`0 11 * * *`).
  - `.github/workflows/`: `ci.yml`, `nightly.yml`, `security.yml`, `cron-reminders.yml`, `database-backup.yml` e `.github/dependabot.yml`.

---

## 1. Resumo Executivo

### Notas por Área (0 a 10)

| Área | Nota | Justificativa Técnica Resumida |
| :--- | :---: | :--- |
| **Regras de Negócio (Domínio vs. Integração)** | **6,5 / 10** | O núcleo puro em `@revezo/domain` é excelente (9,5/10), mas a integração em `packages/db/src/transactions.ts` e `apps/web` possui **bypasses graves**: geração automática aplicada, ajustes de escala preliminar e trocas não revalidam conflito nem limite diário; não há lock pessimista no banco; e o gestor nunca é notificado na substituição automática ou vaga aberta. |
| **Segurança (SecOps / OWASP / LGPD)** | **5,8 / 10** | Boa base (scrypt, TOTP, Proxy de `AuditLog`, headers HTTP), porém comprometida por **segredo hardcoded de fallback** em produção (`AUTH_SECRET`), **IDOR nas Server Actions** de confirmar/desmarcar escala, **backdoor de teste ativo em produção**, dados sensíveis (endereço, notas, emergência) em texto claro no banco, descarte dos dados de responsável de menor no autocadastro e vazamento de PII no payload RSC. |
| **Performance e Banco de Dados** | **6,2 / 10** | Uso adequado de SSR inicial, mas há N+1 em `dispatcher.ts` e no cron de lembretes (com `sleep(1500)` sequencial que estoura timeout em escala), transações interativas longas sem timeout ajustado (`batchImportMembersWithAudit`, `createBatchProgramsWithAudit`), paginação em memória (`getScheduleHistory`) e ausência de constraint única `@@unique([slotId, userId])`. |
| **DevOps e Infraestrutura** | **7,2 / 10** | Pipelines bem estruturados (CI, backup GPG, security scan, Dependabot), mas `ci.yml` e `nightly.yml` configuram `NEXTAUTH_SECRET` em vez de `AUTH_SECRET`, o job E2E no `nightly.yml` não sobe PostgreSQL, e o teste de mutação (Stryker) cobre apenas 3 arquivos e não roda no CI/Nightly. |
| **Qualidade de Código e Arquitetura** | **6,8 / 10** | Fronteira de `@revezo/domain` e `@revezo/contracts` bem respeitada, mas `packages/db/src/transactions.ts` tornou-se um *God File* de **4.808 linhas**, há código morto do Supabase (`lib/client.ts`, `lib/server.ts`, `lib/middleware.ts`), banco acoplado sem interface de repositório, triplicação da lógica de substituição e centenas de usos de `any`. |
| **UI/UX e Acessibilidade Mobile** | **7,0 / 10** | Identidade visual coesa, 100% pt-BR e boa navegação mobile, mas o `layout.tsx` **bloqueia o zoom no celular (`userScalable: false`)**, modais não têm `role="dialog"`/`aria-modal`, há uso de `prompt()`/`confirm()`/`alert()` nativos, botões de gestão aparecem em departamentos onde o usuário é apenas membro, e há **bug de fuso horário (-3h)** entre programas avulsos e recorrentes. |
| **Média Geral Ponderada** | **6,5 / 10** | Arquitetura bem concebida no domínio, mas com falhas críticas na camada transacional (`packages/db`) e de aplicação (`apps/web`) que precisam ser corrigidas antes de operação real em produção. |

### Os 5 Principais Riscos do Projeto

1. **[CRÍTICO — Regras Invioláveis 1 e 2 + Concorrência] Escalas sobrepostas e acima do limite diário podem ser salvas no banco**:
   - `applyAutoScheduleWithLock` (`packages/db/src/transactions.ts:3483-3572`), `adjustAndApproveScheduleAssignmentWithAudit` (`transactions.ts:4666-4736`), `respondSwapRequestWithAudit` (`transactions.ts:2875-2966`) e `approveSwapRequestWithLock` (`transactions.ts:2972-3129`) criam ou transferem `Assignment` **sem verificar conflito de horário, limite diário de 2 escalas ou indisponibilidade**.
   - Além disso, apesar da promessa do `ADR-004`, **nenhuma** função em `transactions.ts` executa `pg_advisory_xact_lock`, `SELECT ... FOR UPDATE` ou isolamento `Serializable`, e o model `Assignment` (`packages/db/prisma/schema.prisma:285-304`) não possui `@@unique([slotId, userId])`. Duas requisições simultâneas violam as regras 1 e 2 no PostgreSQL.
2. **[CRÍTICO — SecOps / Autenticação e Controle de Acesso] Fallback de segredo de sessão/criptografia + IDOR em Server Actions + Backdoor E2E em Produção**:
   - `apps/web/src/lib/auth-service.ts:29` define `const SESSION_SECRET = process.env.AUTH_SECRET || 'chave-secreta-padrao-desenvolvimento-revezo-32b'`. Se `AUTH_SECRET` faltar em produção (como ocorre nos próprios workflows `.github/workflows/ci.yml:67` e `nightly.yml:41`, que definem `NEXTAUTH_SECRET`), qualquer atacante forja cookies de `ADMIN_MASTER` e decripta segredos TOTP.
   - As Server Actions `confirmAction` e `declineAction` (`apps/web/src/app/page.tsx:166-193` e `apps/web/src/app/minha-escala/page.tsx:50-88`) não validam se `assignment.userId === session.userId`, permitindo que qualquer voluntário logado confirme ou desmarque a escala de qualquer outra pessoa (IDOR).
   - `apps/web/src/app/confirmar/[token]/page.tsx:32-51` mantém um bypass hardcoded `if (token === 'e2e-token-valido-teste')` ativo em produção.
3. **[CRÍTICO — LGPD e Proteção de Dados Sensíveis] Campos sensíveis salvos em texto claro, perda de consentimento de menores e vazamento de PII no payload RSC**:
   - Em `registerVolunteer` (`apps/web/src/lib/auth-service.ts:793-798`), o objeto `addressData` faz spread do endereço em texto claro (`...data.address`) junto com `encryptedPayload`. Em `updateUserProfileWithAudit` (`packages/db/src/transactions.ts:348-354`), `address`, `emergencyContact` e `notes` são gravados 100% em texto claro sem `encryptField`.
   - Em `registerVolunteer` (`apps/web/src/lib/auth-service.ts:819-841`), os campos de menor de idade (`isMinor`, `guardianName`, `guardianPhone`, `guardianConsentAt`) validados pelo Zod **não são passados para `prisma.user.create`**, sendo silenciosamente descartados.
   - `apps/web/src/app/membros/page.tsx:90-114` envia `email`, `phonePrimary`, `whatsapp`, `birthDate`, `guardianName` e `guardianPhone` sem máscara no payload RSC para o navegador (aplicando máscara apenas visualmente no cliente em `MembrosClient.tsx:693-695`).
4. **[ALTO — Regra de Negócio 4] Quebra no fluxo de desmarcação, substituição automática e alerta ao gestor**:
   - `notifyAutoSubstitution` (`apps/web/src/services/notifications/swap-and-sub-notifications.ts:24-95`) notifica **apenas o substituto**; o gestor do departamento **nunca é avisado** (nem quando há substituição, nem quando o slot fica aberto). O `ReminderKind.OPEN_SLOT` (`schema.prisma:64`) nunca é emitido em nenhum ponto do sistema.
   - Ao desmarcar pelo Dashboard (`apps/web/src/app/page.tsx:179-193`), nem mesmo o substituto é notificado.
   - Ao desmarcar via link de confirmação (`consumeConfirmationTokenWithAudit`, `transactions.ts:897-907`) ou ao remover membro de departamento (`removeDepartmentMemberInternal`, `transactions.ts:1779-1783`), `findBestSubstituteCandidate` é chamado **sem `statsMap`**, ignorando o desempate por menor carga recente (Regra 3).
5. **[ALTO — Fuso Horário e Confiabilidade Serverless] Bug de 3 horas em programas recorrentes e risco de timeout em transações/cron**:
   - Ao criar programas recorrentes (`createBatchProgramsWithAudit`, `packages/db/src/transactions.ts:4480,4499-4500`), o servidor interpreta `startsAtTime` usando `Date.UTC(...)`, gravando `09:00` como `09:00 UTC` (`06:00 America/Sao_Paulo`), enquanto programas avulsos (`ProgramasClient.tsx:236-237`) usam o fuso local do navegador (`09:00 America/Sao_Paulo` = `12:00 UTC`).
   - O cron `/api/cron/reminders` (`apps/web/src/app/api/cron/reminders/route.ts:110-172`) executa queries N+1 e dorme `1500ms` por envio de WhatsApp (`dispatcher.ts:150`), e `batchImportMembersWithAudit` (`transactions.ts:3823-3929`) faz até 1.000 iterações sequenciais dentro de um `prisma.$transaction` com timeout padrão de 5 segundos.

---

## 2. Pontos Positivos (O que está bem feito e deve ser mantido)

1. **Núcleo de Domínio Puro e Testado (`packages/domain`)**:
   - Os 28 módulos em `packages/domain/src/` não possuem nenhuma dependência de banco de dados, Next.js ou DOM, permitindo reuso direto no web e no app mobile (Capacitor) e execução rápida de testes unitários e de propriedade (`fast-check` em `packages/domain/test/scheduling-properties.test.ts`).
2. **Modelagem Correta de Intervalos Semiabertos e Dia Civil em `America/Sao_Paulo` no Domínio**:
   - `hasTimeOverlap` (`packages/domain/src/scheduling/conflict.ts:25-45`) aplica `sA < eB && sB < eA`, permitindo escalas contíguas (`09:00–10:00` e `10:00–11:00`).
   - `getLocalDateString` (`packages/domain/src/scheduling/daily-limit.ts:18-32`) usa `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ... })` com cache de instâncias `Intl.DateTimeFormat` (`formatterCache`, `daily-limit.ts:7`), evitando recriação custosa em loops.
3. **Imutabilidade de Auditoria por Proxy e Sanitização de Metadados (`packages/db/src/client.ts` e `audit.ts`)**:
   - `wrapClientWithAuditGuard` (`packages/db/src/client.ts:33-57`) intercepta tanto o `prisma` principal quanto o cliente transacional `tx` para impedir `update`, `upsert` e `delete` na tabela `AuditLog`.
   - `sanitizeAuditMeta` (`packages/db/src/audit.ts:45-82`) redige chaves sensíveis (`password`, `token`, `secret`, `cookie`) e mascara e-mails e telefones recursivamente.
4. **Criptografia e Primitivas de Autenticação Zero-Dependency (`packages/domain/src/auth/` e `crypto/aes.ts`)**:
   - Senhas com `crypto.scryptSync` (`N=16384, r=8, p=1, keylen=64`) e comparação constante via `timingSafeEqual` (`packages/domain/src/auth/password.ts:62-99`).
   - Implementação própria enxuta de TOTP RFC 6238 (`packages/domain/src/auth/totp.ts:1-174`) e AES-256-GCM autenticado (`packages/domain/src/crypto/aes.ts:1-80`).
   - Rotação de Refresh Token mobile com detecção de reuso por `familyId` (`packages/domain/src/auth/app-token.ts:64-94` e `packages/db/src/transactions.ts:1297-1410`).
5. **Prevenção contra CSV Injection e Validação de Upload por Magic Bytes**:
   - `sanitizeCsvCell` (`packages/domain/src/member/profile.ts:151-164`) neutraliza fórmulas (`=`, `+`, `-`, `@`, `\t`, `\r`) na exportação CSV.
   - `validateUploadedImageBuffer` (`packages/domain/src/security/web-security.ts:158-221`) valida assinaturas binárias reais (JPEG, PNG, WebP), bloqueia SVG/XSS e `stripImageMetadata` (`apps/web/src/app/api/upload/route.ts:24-127`) remove segmentos APP1/EXIF/GPS de JPEGs e chunks tEXt/eXIf de PNGs sem dependências nativas pesadas.

---

## 3. Matriz de Regras de Negócio e Pontos de Atenção

### 3.1. Tabela das 6 Regras Invioláveis

| # | Regra de Negócio | Status | Onde está implementada | Cobertura de Testes | Cenários de Falha / Riscos Reais Encontrados |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **1** | **Proibição de sobreposição de horário** (`inicioA < fimB && inicioB < fimA`) em qualquer departamento | **Parcial** | **Domínio:** `packages/domain/src/scheduling/conflict.ts:25-71` e `eligibility.ts:88-98`<br>**Banco:** `packages/db/src/transactions.ts:147-168` (`assignMemberWithLock`) | **Unit/Prop:** `packages/domain/test/conflict.test.ts`, `scheduling-properties.test.ts`<br>**Integração:** `packages/db/test/integration-db.test.ts:124-167`<br>**Concorrência (simulada em RAM):** `packages/domain/test/concurrency.test.ts:12-68` | 1. **Bypass em `applyAutoScheduleWithLock` (`transactions.ts:3483-3572`)**: insere `Assignment` sem validar conflitos.<br>2. **Bypass em `adjustAndApproveScheduleAssignmentWithAudit` (`transactions.ts:4666-4736`)**: troca titular sem checar conflito.<br>3. **Bypass em trocas (`respondSwapRequestWithAudit` `2875-2966` e `approveSwapRequestWithLock` `2972-3129`)**: troca aberta e aprovação do gestor não revalidam conflito.<br>4. **Concorrência desprotegida**: não há `pg_advisory_xact_lock`, `FOR UPDATE` nem constraint no banco.<br>5. Escalas em `PENDING_APPROVAL` são ignoradas nas queries de conflito (`transactions.ts:867, 1737, 2553, 2759, 3380`). |
| **2** | **Máximo de 2 escalas por usuário por dia** (`America/Sao_Paulo`); se impedir preenchimento, slot fica `ABERTO` e gestor é alertado | **Parcial** | **Domínio:** `packages/domain/src/scheduling/daily-limit.ts:1-76`, `auto-scheduler.ts:120-217`<br>**Banco:** `packages/db/src/transactions.ts:171-187`, `getOpenSlotsWithSuggestions` (`2133-2298`) | **Unit/Prop:** `packages/domain/test/daily-limit.test.ts`, `scheduling-properties.test.ts`<br>**Integração:** `packages/db/test/integration-db.test.ts:169-208` | 1. **Mesmos 4 bypasses da Regra 1** (`applyAutoScheduleWithLock`, `adjustAndApproveScheduleAssignmentWithAudit`, `respondSwapRequestWithAudit`, `approveSwapRequestWithLock`) permitem escalar a 3ª vez no mesmo dia.<br>2. **Sem alerta ativo ao gestor**: quando a geração automática deixa slots abertos (`applyAutoScheduleWithLock`), nenhum alerta via canal de notificação é enviado ao gestor (apenas exibe na UI).<br>3. **Fuso em programas recorrentes (`transactions.ts:4499-4500`)**: `Date.UTC` desloca os horários em -3h. |
| **3** | **Preferência de dias respeitada, com desempate por menor carga recente** (últimos 60 dias e data mais antiga) | **Parcial** | **Domínio:** `packages/domain/src/scheduling/availability.ts:52-79`, `ranking.ts:15-35`, `auto-scheduler.ts:155-184`, `auto-substitution.ts:127-155` | **Unit/Prop:** `packages/domain/test/availability.test.ts`, `ranking.test.ts`, `auto-scheduler.test.ts`, `scheduling-properties.test.ts` | 1. **`statsMap` omitido em `consumeConfirmationTokenWithAudit` (`transactions.ts:897-907`)** e em **`removeDepartmentMemberInternal` (`transactions.ts:1779-1783`)**: ao recusar pelo link de 1 clique ou sair do departamento, todos os candidatos ficam com carga `0` e o desempate cai para ordem alfabética do `id`!<br>2. Em `declineWithAutoSubstitution` (`transactions.ts:2593-2602`), a carga de 60 dias filtra por `Assignment.createdAt` em vez de `slot.startsAt`, e faz full scan sem filtrar por `userId` nem `churchId`. |
| **4** | **Ao desmarcar: substituto elegível atribuído automaticamente, com aviso ao substituto e ao gestor** | **Parcial** | **Domínio:** `packages/domain/src/scheduling/auto-substitution.ts:29-158`<br>**Banco:** `packages/db/src/transactions.ts:805-947`, `2449-2699`<br>**Notificação:** `apps/web/src/services/notifications/swap-and-sub-notifications.ts:24-95` | **Unit:** `packages/domain/test/auto-substitution.test.ts`<br>**Integração:** `packages/db/test/integration-db.test.ts:273-348` | 1. **Gestor NUNCA é notificado**: `notifyAutoSubstitution` (`swap-and-sub-notifications.ts:24-95`) envia mensagem apenas ao substituto (`newAsg.userId`), nunca aos gestores do departamento.<br>2. **Sem aviso quando não há substituto**: se `autoSubstituted === false`, `notifyAutoSubstitution` nem é chamado (`minha-escala/page.tsx:76`, `api/confirmar/[token]/route.ts:117`).<br>3. **Desmarcar pelo Dashboard (`apps/web/src/app/page.tsx:179-193`)** não chama `notifyAutoSubstitution` nem para o substituto.<br>4. **Slot substituído continua aparecendo como vaga aberta**: a escala original fica `DECLINED` em vez de `SUBSTITUTED` (`transactions.ts:2482`), e `getOpenSlotsWithSuggestions` (`transactions.ts:2196-2198`) marca o slot como aberto se `declined.length > 0`. |
| **5** | **Lembretes 7, 2 e 1 dia antes, apenas para escalados ativos** | **Parcial** | **Domínio:** `packages/domain/src/notifications/reminder-calculator.ts:39-100`<br>**Cron:** `apps/web/src/app/api/cron/reminders/route.ts:1-189` | **Unit:** `packages/domain/test/reminder-calculator.test.ts`<br>**Integração:** `packages/db/test/integration-db.test.ts:520-585` | 1. Na função pura `identifyPendingReminders` (`reminder-calculator.ts:78`), o filtro exclui apenas `DECLINED` e `SUBSTITUTED`, não excluindo `PENDING_APPROVAL` (embora a query da rota `cron/reminders/route.ts:51` filtre `in: ['PENDING', 'CONFIRMED']`).<br>2. `NotificationLog` (`schema.prisma:317-327`) possui apenas `@@index([assignmentId, kind])` e **não possui constraint única**, permitindo envios duplicados se duas instâncias do cron rodarem simultaneamente. |
| **6** | **Autocadastro fica `PENDENTE` até aprovação, sem acesso a dados antes disso** | **Implementada** | **Auth:** `apps/web/src/lib/auth-service.ts:694-699, 169-171, 825`<br>**RBAC:** `packages/domain/src/authz/can.ts:114-116` | **Unit/Matriz:** `packages/domain/test/authz-matrix.test.ts`<br>**Rotas:** `apps/web/test/auth-routes.test.ts`, `rbac-authorization.test.ts` | A regra de bloqueio de acesso para `PENDING` está sólida no login, na validação de sessão e em `can()`. Contudo, na tela de aprovação (`apps/web/src/app/api/aprovacoes/aprovar/route.ts:32-42`), se `departmentId` for omitido no payload, qualquer gestor aprova cadastros sem vinculá-los ao seu departamento. |

---

### 3.2. Análise dos 5 Pontos de Atenção Específicos

#### 1) Concorrência: a regra de sobreposição é garantida só na aplicação ou também no banco? Duas requisições simultâneas podem violá-la?
- **Diagnóstico:** Garantida **apenas na aplicação** e **vulnerável a corrida (race condition)**.
- **Evidência:**
  - Apesar de `docs/adr/ADR-004-consistencia-da-escala.md:9` prever *"advisory lock por userId ou SELECT FOR UPDATE"* e a função se chamar `assignMemberWithLock` (`packages/db/src/transactions.ts:46`), o código executa apenas `prisma.$transaction(async (tx) => { ... })` (`transactions.ts:49`) no nível de isolamento padrão do PostgreSQL (`READ COMMITTED`), **sem `pg_advisory_xact_lock` e sem `SELECT ... FOR UPDATE`**.
  - No banco (`packages/db/prisma/schema.prisma:285-304` e `migrations/20261001000000_init_schema/migration.sql:143-153`), a tabela `Assignment` não possui colunas `startsAt`/`endsAt` nem constraint de exclusão GiST com `tstzrange`, e **não possui sequer `@@unique([slotId, userId])`**.
  - Os testes em `packages/domain/test/concurrency.test.ts:15,83,168` simulam um lock em memória RAM (`let lock = Promise.resolve()`), e `packages/db/test/integration-db.test.ts:140-160` executa as duas chamadas sequencialmente (`await` antes do segundo `await`). Duas requisições simultâneas (`Promise.all`) leem o mesmo snapshot em `READ COMMITTED` e ambas gravam no banco.

#### 2) "Dia" da Regra 2: é calculado em `America/Sao_Paulo` ou em `UTC`?
- **Diagnóstico:** Na verificação do limite diário (`packages/domain/src/scheduling/daily-limit.ts:18-32`), o dia é calculado **corretamente em `America/Sao_Paulo`**. Uma escala às `21:00` de domingo em São Paulo (`2026-10-18T21:00:00-03:00` = `2026-10-19T00:00:00Z`) é contabilizada no dia `2026-10-18`.
- **Ressalva crítica na criação de programas:** Em `createBatchProgramsWithAudit` (`packages/db/src/transactions.ts:4480,4499-4500`), o servidor converte `startsAtTime` usando `Date.UTC(y, m, day, startH, startM, 0)`. Assim, um culto recorrente configurado para `21:00` é salvo como `21:00 UTC` (`18:00 America/Sao_Paulo`), gerando erro de 3 horas no horário real do slot.

#### 3) A busca de substituto respeita as Regras 1 e 2, evita escolher a mesma pessoa que desmarcou e trata o caso de nenhum elegível?
- **Diagnóstico:** Na função de domínio `findBestSubstituteCandidate` (`packages/domain/src/scheduling/auto-substitution.ts:29-158`), **sim**: ela exclui todos os IDs em `declinedUserIds` (`line 130`), chama `checkEligibility` (que valida Regras 1, 2, 3, função e status `ACTIVE`, `line 135`) e retorna `{ candidate: null, diagnosis }` quando ninguém é elegível (`lines 139-143`).
- **Falhas na camada de banco (`packages/db/src/transactions.ts`):**
  1. Ao carregar `assignments` dos candidatos em `declineWithAutoSubstitution` (`line 2553`), `consumeConfirmationTokenWithAudit` (`line 867`) e `removeDepartmentMemberInternal` (`line 1737`), o Prisma filtra `status: { in: ['PENDING', 'CONFIRMED'] }`, ignorando escalas em `PENDING_APPROVAL` (que o domínio considera conflito ativo).
  2. Como não há lock no candidato escolhido durante a transação, duas desmarcações simultâneas para slots de mesmo horário escolhem o mesmo substituto ao mesmo tempo.
  3. Quando não há substituto elegível (`subResult.candidate === null`), o banco registra o `AuditLog` (`AUTO_SUBSTITUTION_NO_CANDIDATE`), mas **nenhum alerta é disparado ao gestor**.

#### 4) Os lembretes são idempotentes e deixam de ser enviados após desmarcação ou substituição?
- **Diagnóstico:** **Parcialmente.**
- **Evidência:**
  - `apps/web/src/app/api/cron/reminders/route.ts:50-55` busca apenas `Assignment` com `status: { in: ['PENDING', 'CONFIRMED'] }`, portanto escalas com status `DECLINED` ou `SUBSTITUTED` não recebem lembretes.
  - `identifyPendingReminders` (`packages/domain/src/notifications/reminder-calculator.ts:69-100`) verifica logs prévios com `l.success === true` para `${assignmentId}:${kind}`. Se o cron rodar duas vezes **em sequência**, o segundo disparo é ignorado com segurança.
  - Porém, se duas execuções do cron rodarem **em paralelo** (ex.: Vercel Cron + GitHub Actions `cron-reminders.yml` disparados na mesma janela, ou retry por lentidão), ambas leem `NotificationLog` antes da inserção e enviam lembretes duplicados, pois `NotificationLog` (`packages/db/prisma/schema.prisma:317-327`) não possui constraint única nem lock por registro.

#### 5) O que acontece quando o banco gratuito pausa por inatividade ou o canal de envio falha (retry, fila, alerta)?
- **Banco gratuito:** Existe o endpoint `/api/cron/keepalive` (`apps/web/src/app/api/cron/keepalive/route.ts:1-66`) agendado diariamente em `apps/web/vercel.json:5-8` (`0 3 * * *`) que executa `SELECT 1` com **1 retry** após `1500ms` (`keepalive/route.ts:11-26`) para acordar o compute (cold start do Neon) e evitar a pausa de 7 dias do Supabase. Nas rotas normais da aplicação (`packages/db/src/client.ts`), **não há retry de conexão** caso o compute do Neon leve >5s para acordar.
- **Falha no canal de envio:** `NotificationDispatcher.dispatch` (`apps/web/src/services/notifications/dispatcher.ts:132-160`) tenta os canais habilitados em cascata (` canal preferido -> PUSH -> EMAIL -> WHATSAPP -> SMS`). Assim que um canal retorna `success: true`, ele encerra; se falhar, tenta o próximo canal na mesma requisição e grava cada tentativa em `NotificationLog`. **Não existe fila de retry assíncrono (backoff) nem alerta ao administrador** quando todos os canais falham.

### 3.3. Limites de Planos Gratuitos Verificados nas Fontes Oficiais

Conforme exigido no item 5 do modo de trabalho, os limites abaixo foram conferidos nas documentações oficiais vigentes:

| Provedor / Serviço | Limites Oficiais Verificados do Plano Gratuito | Impacto na Arquitetura Atual do Revezo |
| :--- | :--- | :--- |
| **Neon (Free Plan)** | • **Armazenamento:** 1 GB por projeto (cap de 20 GB na conta)<br>• **Compute:** 100 CU-hours/mês por projeto (~400h a 0.25 CU)<br>• **Scale-to-zero:** suspende após **5 min de inatividade** (cold start na próxima query)<br>• **Transferência (Egress):** 5 GB/mês<br>• **Point-in-time restore:** 6 horas | O scale-to-zero após 5 min é inevitável no Free Plan. A 1ª requisição após 5 min ocioso sofre cold start (~500ms a 3s). Os 100 CU-hours/mês folgam para uso semanal de igreja, desde que não haja polling constante. |
| **Supabase (Free Plan)** | • **Armazenamento DB:** 500 MB por projeto (~40–60 MB ocupados pelo sistema)<br>• **Pausa por inatividade:** projeto é **pausado após 7 dias sem queries**<br>• **Projetos ativos:** máx. 2 por organização<br>• **Egress:** 5 GB + 5 GB cached<br>• **Backups automáticos:** **0 dias** (não incluídos no plano gratuito) | O `/api/cron/keepalive` diário impede a pausa de 7 dias, e o workflow `.github/workflows/database-backup.yml` (`pg_dump` + GPG) supre a ausência de backup nativo no tier gratuito do Supabase. |
| **Vercel (Hobby Plan — Cron & Functions)** | • **Frequência mínima de Cron:** **1 vez por dia** (expressões com maior frequência falham no deploy)<br>• **Precisão de horário:** janela de **±59 minutos** (ex.: `0 11 * * *` pode rodar entre `11:00` e `11:59 UTC`)<br>• **Quantidade:** até 100 cron jobs por projeto (apenas em produção e em UTC)<br>• **Timeout máximo de Function (`maxDuration`):** até **300 segundos** no Hobby | `apps/web/vercel.json` usa crons diários (`0 3 * * *` e `0 11 * * *`), compatível com o Hobby. Porém, `cron/reminders/route.ts` não declara `export const maxDuration = 60` (ou `300`) e faz `sleep(1500)` sequencial por WhatsApp. |
| **GitHub Actions (Free Plan)** | • **Repositórios públicos:** minutos ilimitados em runners padrão<br>• **Repositórios privados:** **2.000 minutos/mês** (Linux = 1x, Windows = 2x, macOS = 10x) e **500 MB** de armazenamento de artefatos/cache<br>• **Concorrência:** até 20 jobs simultâneos | Os 5 workflows usam `ubuntu-latest` (1x). Com cron diário (`cron-reminders.yml`, `database-backup.yml`, `nightly.yml`) + pushes (`ci.yml`, `security.yml`), o consumo fica estimado em ~350–500 min/mês, dentro da cota de 2.000 min/mês em repositório privado. |
| **Resend (Free Plan — E-mail)** | • **Limite diário:** **100 e-mails/dia** (reset às 00:00 UTC)<br>• **Limite mensal:** **3.000 e-mails/mês**<br>• **Domínios verificados:** até 3 domínios<br>• **Contagem:** cada destinatário (`To`/`CC`/`BCC`) e e-mail recebido conta na cota | **Risco operacional real:** Em dias de culto com >100 voluntários somando lembretes D-7, D-2, D-1, confirmações e trocas, o limite duro de **100 e-mails/dia** do Resend Free pode ser atingido se o e-mail for o canal primário ou fallback principal. |

---

## 4. Achados Detalhados por Área

### 4.1. Segurança, Controle de Acesso e LGPD (SecOps)

| ID | Severidade | Local (`arquivo:linha`) | Problema | Impacto | Recomendação | Esforço |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **SEC-01** | **Crítica** | `apps/web/src/lib/auth-service.ts:29` e `.github/workflows/ci.yml:67`, `nightly.yml:41` | `SESSION_SECRET` usa fallback hardcoded `'chave-secreta-padrao-desenvolvimento-revezo-32b'` quando `process.env.AUTH_SECRET` está ausente. Nos workflows de CI/Nightly a variável foi nomeada `NEXTAUTH_SECRET` por engano. | Se `AUTH_SECRET` for omitida ou digitada como `NEXTAUTH_SECRET` em produção, qualquer atacante pode assinar cookies `revezo_sess` válidos como `ADMIN_MASTER` e descriptografar segredos TOTP/PII. | Lançar erro fatal (`throw new Error`) em produção (`NODE_ENV === 'production'`) se `!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32`. Corrigir `ci.yml` e `nightly.yml` para `AUTH_SECRET`. | **P** |
| **SEC-02** | **Crítica** | `apps/web/src/app/page.tsx:166-193`, `apps/web/src/app/minha-escala/page.tsx:50-88`, `packages/db/src/transactions.ts:262-286, 2449-2486` | **IDOR nas Server Actions `confirmAction` e `declineAction`**: recebem `assignmentId` do `FormData` e atualizam o status sem verificar se `assignment.userId === session.userId`. | Qualquer voluntário autenticado pode confirmar ou desmarcar a escala de qualquer outro membro (de qualquer departamento ou igreja) enviando um POST com o `assignmentId` alvo. | Validar dentro da transação em `confirmAssignmentWithAudit` e `declineWithAutoSubstitution` que `assignment.userId === actorId` (ou que `actor` tem permissão `can(actor, 'assignment:manage', ...)`). | **P** |
| **SEC-03** | **Crítica** | `apps/web/src/app/confirmar/[token]/page.tsx:32-51` | **Backdoor de teste E2E em produção**: `if (token === 'e2e-token-valido-teste')` renderiza tela de confirmação válida sem checar ambiente de teste. | Exposição de rota com token mágico fixo em ambiente de produção. | Condicionar estritamente a `process.env.NODE_ENV === 'test'` ou `process.env.ALLOW_E2E_MOCK_TOKENS === 'true'` (nunca em produção), ou usar seed real no teste E2E. | **P** |
| **SEC-04** | **Alta** | `apps/web/src/lib/auth-service.ts:792-807, 819-841` e `packages/db/src/transactions.ts:348-354` | **Violação LGPD (Regra 13)**: 1) `registerVolunteer` espalha `...data.address` em texto claro junto com `encryptedPayload`; 2) `updateUserProfileWithAudit` grava `address`, `emergencyContact` e `notes` 100% em texto claro; 3) `registerVolunteer` descarta `isMinor`, `guardianName`, `guardianPhone` e `guardianConsentAt` ao criar o usuário no banco. | Endereços, contatos de emergência e observações ficam em texto claro no banco de dados; e cadastros de menores de idade perdem o registro legal do responsável e do consentimento exigido pelo Art. 14 da LGPD. | Criptografar exclusivamente com `encryptField` os campos `address`, `emergencyContact`, `notes` e `guardianPhone` tanto no cadastro quanto na atualização de perfil, e persistir os campos `isMinor`/`guardian*` em `registerVolunteer`. | **M** |
| **SEC-05** | **Alta** | `apps/web/src/app/membros/page.tsx:90-114`, `departamentos/page.tsx:65-74`, `aprovacoes/page.tsx:46-58` | **Vazamento de PII no Payload RSC**: os Server Components enviam `email`, `phonePrimary`, `whatsapp`, `birthDate`, `guardianName` e `guardianPhone` sem máscara nas props dos Client Components; a máscara em `MembrosClient.tsx:693-695` é apenas visual. | Qualquer usuário com acesso à página pode inspecionar o HTML/RSC payload no DevTools e extrair todos os telefones, e-mails e datas de nascimento sem máscara de membros fora do seu escopo. | Aplicar `maskEmail`, `maskPhoneNumber` e omissão de `birthDate`/`guardian*` **no Server Component** (`membros/page.tsx`, `departamentos/page.tsx`, `aprovacoes/page.tsx`) antes de passar as props ao Client Component. | **P** |
| **SEC-06** | **Alta** | `apps/web/src/app/api/aprovacoes/aprovar/route.ts:32-42` e `rejeitar/route.ts:31-42` | Na aprovação de cadastro, `departmentId` é opcional no schema; quando omitido, `if (parsed.data.departmentId && !can(...))` é pulado e qualquer gestor aprova ou rejeita qualquer usuário `PENDING` da igreja sem escopo de departamento. | Um gestor de um departamento pode aprovar ou rejeitar cadastros destinados a outros departamentos. | Tornar `departmentId` obrigatório quando o aprovador for apenas `MANAGER` de departamento (não `ADMIN_MASTER`/`PASTOR`/`ELDER`), validando sempre `can(authContext, 'member:approve', { departmentId })`. | **P** |
| **SEC-07** | **Alta** | `apps/web/src/middleware.ts:107` e `apps/web/src/lib/auth-service.ts:125-196, 241-248` | 1) **Loop infinito de redirecionamento**: `middleware.ts:107` redireciona `/login` para `/` apenas pela existência do cookie `revezo_sess`, sem validar expiração/assinatura; quando expirado, `page.tsx:13` redireciona `/` de volta para `/login` (`ERR_TOO_MANY_REDIRECTS`).<br>2) `lastActiveAt` nunca é atualizado a cada request.<br>3) Cookies web não são revogados no servidor ao redefinir senha (`transactions.ts:1190`). | Usuários com cookie expirado ficam presos em loop infinito de redirecionamento e precisam limpar cookies manualmente; e sessões web antigas continuam válidas por até 8h após troca de senha. | No `middleware.ts`, se `pathname === '/login'` ou ao receber `?expired=1`, limpar o cookie inválido; adicionar campo `passwordChangedAt` ou `sessionVersion` no `User` para invalidar sessões emitidas antes de `passwordChangedAt`. | **M** |
| **SEC-08** | **Média** | `apps/web/src/components/Navbar.tsx:124-135` e `MobileBottomNav.tsx:177-185` | No logout, a função `clearClientUserCache()` (`apps/web/src/components/PwaRegister.tsx:5`) nunca é invocada antes do submit do form de logout. | Páginas autenticadas cacheadas pelo Service Worker (`/`, `/minha-escala`, `/perfil` em `public/sw.js:85`) permanecem no Cache Storage do navegador após o logout em dispositivos compartilhados. | Disparar `clearClientUserCache()` no evento `onSubmit` do botão "Sair" em `Navbar.tsx` e `MobileBottomNav.tsx` e enviar header `Clear-Site-Data: "cache", "cookies", "storage"` no logout. | **P** |
| **SEC-09** | **Média** | `apps/web/src/app/login/page.tsx:12, 60` | **Open Redirect no Login**: `const from = searchParams.get('from') || '/';` seguido de `router.push(from)` sem validar se é caminho relativo interno. | Atacante pode enviar link `/login?from=https://site-malicioso.com` ou `//site-malicioso.com` para redirecionar a vítima após autenticar. | Validar `const safeFrom = from.startsWith('/') && !from.startsWith('//') ? from : '/';` antes de chamar `router.push(safeFrom)`. | **P** |
| **SEC-10** | **Média** | `apps/web/src/middleware.ts:74-81` | Verificação CSRF `if (origin && !isAllowedOrigin(origin, host))` permite requisições mutantes (`POST`/`PUT`/`DELETE`) quando o header `Origin` está ausente (sem checar `Referer` ou header customizado). | Clientes/contextos que suprimem o header `Origin` contornam o filtro CSRF do middleware. | Exigir `Origin` (ou `Referer` de mesma origem / header `X-Requested-With` nas chamadas `fetch` da API) em métodos mutantes não-webhook. | **P** |
| **SEC-11** | **Média** | `apps/web/src/app/api/webhooks/whatsapp/route.ts:103-129` | Se `WHATSAPP_WEBHOOK_SECRET` não estiver configurado (`line 103`), o endpoint aceita webhooks sem assinatura HMAC e confirma/desmarca a última escala `PENDING` do telefone informado (`lines 166-180`). | Violação da Regra 14 (fail-closed): em ambiente onde a variável não foi configurada, qualquer requisição externa pode desmarcar escalas de voluntários sabendo apenas o telefone. | Aplicar fail-closed em produção: se `!webhookSecret`, retornar `503` ou `401` e recusar o processamento do webhook. | **P** |
| **SEC-12** | **Média** | `apps/web/src/middleware.ts:44` e `apps/web/next.config.ts:21` | Content Security Policy (CSP) inclui `'unsafe-inline'` na diretiva `script-src`. | Reduz a eficácia da CSP contra ataques de Cross-Site Scripting (XSS). | Adotar nonce por requisição no `middleware.ts` para scripts do Next.js em produção ou migrar para hashes estáticos. | **M** |
| **SEC-13** | **Baixa** | `docs/requirements.md:14,31` vs `apps/web/src/app/cadastro/page.tsx:297-312` | Na LGPD (Art. 5º, II e Art. 11), o vínculo com uma igreja denomina-se dado pessoal sensível (convicção religiosa). O termo no cadastro (`cadastro/page.tsx:297-312`) menciona tratamento de dados para escalas, mas não destaca explicitamente o consentimento específico para dado sensível religioso nem permite revogação simplificada sem exclusão total. | Risco de questionamento jurídico quanto à especificidade do consentimento do Art. 11, I da LGPD. | Atualizar o texto do termo em `cadastro/page.tsx` para explicitar a finalidade exclusivamente eclesiástica/interna (Art. 11, I e II) e registrar o texto/hash da versão aceita (`termsVersion`). | **P** |

---

### 4.2. Performance e Banco de Dados

| ID | Severidade | Local (`arquivo:linha`) | Problema | Impacto | Recomendação | Esforço |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **PERF-01** | **Alta** | `apps/web/src/app/api/cron/reminders/route.ts:110-172` e `apps/web/src/services/notifications/dispatcher.ts:80, 150` | **N+1 Queries + `sleep(1500)` sequencial no Cron de Lembretes**: para cada lembrete pendente, o loop chama sequencialmente `createConfirmationTokenWithAudit` (3 queries cada), `dispatcher.dispatch` (que faz `prisma.featureFlag.findMany()` a cada chamada na linha 80 e dorme `1500ms` após cada WhatsApp na linha 150) e `recordNotificationLog`. | Com 100 lembretes no dia, o cron executa >400 queries sequenciais e dorme >150 segundos, esgotando conexões e correndo alto risco de timeout na Vercel Hobby e falha parcial sem retomada. | 1) Carregar `featureFlags` e `churchSettings` **uma única vez** fora do loop;<br>2) Gerar tokens em lote (`createMany`);<br>3) Processar em lotes controlados (`chunk` de 25–50) com `export const maxDuration = 300;` na rota. | **M** |
| **PERF-02** | **Alta** | `packages/db/src/transactions.ts:3823-3929` e `4475-4519` | **Transações interativas longas sem `timeout` configurado**: `batchImportMembersWithAudit` (até 1.000 linhas com múltiplos `findUnique`/`upsert` por linha) e `createBatchProgramsWithAudit` (até 100 programas com slots) rodam dentro de `prisma.$transaction(async (tx) => ...)` usando o timeout padrão de **5.000ms** do Prisma. | Importações de planilhas com >50 membros ou criação de programas anuais em banco serverless (Neon/Supabase) abortam com erro `P2028 (Transaction API error: Transaction already closed)`. | Pré-carregar usuários existentes com `findMany({ where: { email: { in: emails } } })`, usar operações em lote (`createMany`) e definir `{ maxWait: 10000, timeout: 30000 }` no `$transaction`. | **M** |
| **PERF-03** | **Alta** | `packages/db/src/transactions.ts:2593-2602` | Em `declineWithAutoSubstitution`, a query `recentAssignments` busca **todas** as `Assignment` criadas nos últimos 60 dias no banco inteiro (`where: { createdAt: { gte: sixtyDaysAgo }, status: { in: ['CONFIRMED', 'PENDING'] } }`), sem filtrar por `userId: { in: memberIds }` e filtrando por `createdAt` em vez de `slot.startsAt`. | Full scan desnecessário em todas as escalas de todas as congregações a cada desmarcação, além de distorcer a estatística de 60 dias. | Filtrar `where: { userId: { in: members.map(m => m.id) }, status: { in: ['CONFIRMED', 'PENDING'] }, slot: { startsAt: { gte: sixtyDaysAgo, lte: now } } }` (igual ao que já é feito em `previewAutoSchedule` na linha 3410). | **P** |
| **PERF-04** | **Média** | `packages/db/src/audit.ts:352-365, 568` | Em `getScheduleHistory`, a consulta busca fixamente `take: 300` assignments e `take: 500` auditLogs no banco, monta todos os eventos em memória e só ao final aplica `events.slice(skip, skip + limit)`. | A paginação para de funcionar após o 300º registro e transfere centenas de linhas desnecessárias do PostgreSQL a cada abertura da página `/historico`. | Aplicar paginação diretamente na query do Prisma (`skip`, `take`) com `count` separado. | **M** |
| **PERF-05** | **Média** | `packages/db/prisma/schema.prisma:285-315, 317-327` | **Constraints e índices ausentes no schema**:<br>1) `Assignment` não possui `@@unique([slotId, userId])` (previsto no `ADR-004`);<br>2) `Availability` (`line 314`) possui apenas `@@index([userId])`, faltando `@@index([userId, kind])`;<br>3) `NotificationLog` (`line 326`) não possui índice/unique composto com `channel`/`success`. | Permite duplicidade do mesmo voluntário no mesmo slot em caso de corrida e reduz eficiência de filtros de disponibilidade e idempotência. | Adicionar `@@unique([slotId, userId])` (ou índice único parcial para status ativos), `@@index([userId, kind])` em `Availability` e `@@unique([assignmentId, kind, channel])` em `NotificationLog`. | **P** |
| **PERF-06** | **Média** | `apps/web/src/app/layout.tsx:16-84` | O `RootLayout` executa em **toda** navegação SSR: `getSession()` (1 query `User` + `DepartmentMember` + `PastorChurch`), `getActiveChurchContext()` (1 a 2 queries `Church`) e 3 `count()` paralelos (`user.count`, `programSlot.count` com filtro relacional `assignments: { none: ... }`, `assignment.count`). | 5 a 6 queries no banco a cada transição de página, aumentando a latência (TTFB/LCP) especialmente em conexões móveis e consumindo CU-hours do banco gratuito. | Unificar o carregamento de igreja no contexto da sessão e cachear os contadores da barra de navegação por 30–60s com `unstable_cache` / `revalidateTag`. | **M** |
| **PERF-07** | **Baixa** | `apps/web/package.json:26-27, 36` | Dependências `@supabase/ssr` e `@supabase/supabase-js` instaladas sem uso real no projeto, e biblioteca `xlsx` carregada no bundle de `MembrosClient.tsx:4`. | Aumenta o tempo de instalação/build e o bundle JS da página `/membros` (`xlsx` adiciona ~150KB gzipped no cliente mesmo quando o gestor não vai importar planilha). | Remover `@supabase/ssr` e `@supabase/supabase-js` de `apps/web/package.json` (e os arquivos mortos `src/lib/{client,server,middleware}.ts`), e usar `await import('xlsx')` dinâmico apenas no momento do upload do arquivo. | **P** |

---

### 4.3. DevOps e Infraestrutura

| ID | Severidade | Local (`arquivo:linha`) | Problema | Impacto | Recomendação | Esforço |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **OPS-01** | **Alta** | `.github/workflows/ci.yml:67-68` e `.github/workflows/nightly.yml:41-42` | Os workflows definem `NEXTAUTH_SECRET` e `NEXTAUTH_URL`, mas o código da aplicação utiliza `AUTH_SECRET` e `NEXT_PUBLIC_APP_URL`. | Os testes e builds no CI rodam caindo no segredo hardcoded de fallback sem testar a configuração real de variáveis. | Substituir `NEXTAUTH_SECRET` por `AUTH_SECRET` e `NEXTAUTH_URL` por `NEXT_PUBLIC_APP_URL` em ambos os workflows. | **P** |
| **OPS-02** | **Média** | `.github/workflows/nightly.yml:36-65` | O job `e2e-smoke` define `DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci?schema=public"`, mas **não declara `services: postgres`** nem executa `prisma migrate deploy` ou `db:seed`. | Qualquer teste E2E adicionado que consulte o banco falhará no Nightly por ausência do serviço PostgreSQL no container do job `e2e-smoke`. | Adicionar o bloco `services: postgres: image: postgres:16-alpine` e os passos `pnpm --filter @revezo/db prisma migrate deploy` + `pnpm db:seed` no job `e2e-smoke`. | **P** |
| **OPS-03** | **Média** | `.github/workflows/nightly.yml:1-66` e `packages/domain/stryker.config.json:11-15` | 1) O script `pnpm test:mutation` (Stryker) não é executado em nenhum workflow do GitHub Actions;<br>2) `stryker.config.json` analisa apenas 3 arquivos (`conflict.ts`, `daily-limit.ts`, `auto-substitution.ts`), ignorando `eligibility.ts`, `auto-scheduler.ts`, `ranking.ts` e `can.ts`. | Regressões na qualidade dos testes de autorização (`can.ts`) e elegibilidade passam despercebidas pelo gate de mutação exigido na Regra 05. | Incluir `src/scheduling/eligibility.ts`, `src/scheduling/auto-scheduler.ts`, `src/scheduling/ranking.ts` e `src/authz/can.ts` no `stryker.config.json` e adicionar step `pnpm test:mutation` no `nightly.yml`. | **P** |
| **OPS-04** | **Média** | `apps/web/vercel.json:1-14` vs `.github/workflows/cron-reminders.yml:1-46` | O disparo de `/api/cron/reminders` está configurado tanto no `vercel.json` (`0 11 * * *`) quanto no GitHub Actions (`cron-reminders.yml`, `0 11 * * *`). | Como ambos estão agendados para `11:00 UTC`, podem executar no mesmo instante em produção e disparar notificações duplicadas (visto que `NotificationLog` não tem unique constraint). | Manter apenas um agendador ativo por ambiente (ou adicionar lock transacional / unique constraint em `NotificationLog` antes de manter redundância). | **P** |
| **OPS-05** | **Baixa** | `apps/web/src/app/api/v1/health/route.ts:1-21` | O endpoint `/api/v1/health` retorna apenas `{ status: 'ok', timestamp }` estático sem testar conectividade com o banco (`SELECT 1`). | Monitoramento externo recebe `200 OK` mesmo se o PostgreSQL estiver inacessível ou com pool esgotado. | Adicionar verificação opcional ou leve (`await prisma.$queryRaw\`SELECT 1\`` com timeout curto) retornando `503` em caso de falha de banco. | **P** |

---

### 4.4. Qualidade de Código e Arquitetura

| ID | Severidade | Local (`arquivo:linha`) | Problema | Impacto | Recomendação | Esforço |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **ARCH-01** | **Alta** | `packages/db/src/transactions.ts:3483-3572, 4666-4736, 2875-3129` e `schema.prisma:285-304` | **Invariantes de domínio contornadas na persistência e falta de lock real (`ADR-004` não cumprido)**: `applyAutoScheduleWithLock`, `adjustAndApproveScheduleAssignmentWithAudit`, `respondSwapRequestWithAudit` e `approveSwapRequestWithLock` gravam escalas sem passar por `checkEligibility`; e nenhuma transação executa `pg_advisory_xact_lock(hashtext(userId))`. | Quebra direta das Regras Invioláveis 1, 2 e 3 e divergência entre a arquitetura documentada (`ADR-004`, `ADR-012`) e o código em execução. | Criar função interna única `assertAndCreateAssignment(tx, slot, userId)` que sempre adquire `SELECT pg_advisory_xact_lock(hashtext($1))` no `userId` e executa `checkEligibility` antes de qualquer `create`/`update` em `Assignment`. | **M** |
| **ARCH-02** | **Alta** | `packages/db/src/transactions.ts:4480, 4499-4500` vs `apps/web/src/app/programas/ProgramasClient.tsx:236-237` | **Bug de fuso horário em programas recorrentes**: `createBatchProgramsWithAudit` monta `startsAt` e `endsAt` com `Date.UTC(y, m, day, startH, startM, 0)`, interpretando o horário digitado pelo usuário como UTC em vez de `America/Sao_Paulo` (`-03:00`). | Um culto recorrente cadastrado às `19:00` é salvo às `19:00 UTC` (`16:00` no horário de Brasília), deslocando todas as escalas recorrentes em 3 horas. | Converter `(date, HH:mm)` em `America/Sao_Paulo` para UTC no domínio (ex.: helper puro `parseLocalTimeInSaoPauloToUtc(dateStr, timeStr)`) e usá-lo tanto em programas únicos quanto recorrentes. | **P** |
| **ARCH-03** | **Alta** | `apps/web/src/app/api/escalas/remover/route.ts:53-55` | A rota `POST /api/escalas/remover` executa `await prisma.assignment.delete({ where: { id: assignment.id } })` diretamente na rota, sem transação em `@revezo/db`, sem acionar substituição automática e violando foreign keys se houver `SwapRequest`. | 1) Erro 500 se já existir `SwapRequest` vinculada à escala (`ON DELETE RESTRICT` em `migration.sql:378`);<br>2) Perda de histórico da escala removida;<br>3) Não aciona substituição automática nem alerta. | Mover para uma função transacional em `@revezo/db` que marque a escala ou limpe dependências com segurança e opcionalmente dispare a substituição automática. | **P** |
| **ARCH-04** | **Média** | `packages/db/src/transactions.ts:1-4808` | **Violação severa de SRP (Single Responsibility Principle)**: um único arquivo concentra **4.808 linhas** e 37 casos de uso de 9 domínios diferentes (auth, tokens, membros, departamentos, programas, escalas, trocas, LGPD, relatórios). | Dificulta manutenção, revisão de código, testes isolados e aumenta risco de regressões acidentais (como as divergências encontradas entre os 3 fluxos de substituição automática). | Dividir `packages/db/src/transactions.ts` em módulos coesos: `scheduling.tx.ts`, `substitution.tx.ts`, `swap.tx.ts`, `auth-tokens.tx.ts`, `member.tx.ts`, `department.tx.ts`, `program.tx.ts`, `church.tx.ts` e `reports.tx.ts`, reexportando em `index.ts`. | **M** |
| **ARCH-05** | **Média** | `packages/db/src/transactions.ts:853-935, 1719-1853, 2533-2690` | **Violação DRY na substituição automática**: a rotina que busca membros do departamento, monta `CandidateUser[]` e chama `findBestSubstituteCandidate` foi copiada e colada em 3 lugares diferentes (`consumeConfirmationTokenWithAudit`, `removeDepartmentMemberInternal`, `declineWithAutoSubstitution`), sendo que nos 2 primeiros o `statsMap` foi esquecido e os status finais divergem (`DECLINED` vs `SUBSTITUTED`). | Comportamento inconsistente dependendo de *onde* o voluntário desmarcou (link de confirmação vs tela web vs saída de departamento) e slots substituídos permanecendo como "Vaga Aberta" em `/slots-abertos`. | Extrair helper único `executeAutoSubstitutionInTx(tx, assignment, reason, actorId)` que sempre calcula `statsMap` (por `slot.startsAt`), marca a escala original como `SUBSTITUTED` quando encontra substituto (ou `DECLINED` quando não encontra) e retorna os dados para notificação do substituto e do gestor. | **M** |
| **ARCH-06** | **Média** | `apps/web/src/app/**/page.tsx` e `apps/web/src/app/api/**/route.ts` | **Acoplamento direto ao Prisma (`prisma.*`) nas rotas e páginas de `apps/web`**: embora os canais de notificação estejam bem isolados atrás de `NotificationChannelAdapter` e `WhatsAppProvider`, o banco de dados **não** está atrás de interfaces de repositório; páginas e API routes importam `prisma` diretamente de `@revezo/db` em dezenas de arquivos. | Viola a restrição arquitetural *"Banco e canais de envio devem ficar atrás de interfaces, para trocar de provedor sem reescrever"*. Trocar o Prisma exigiria reescrever dezenas de páginas e rotas em `apps/web`. | Encapsular as leituras restantes de `apps/web` em serviços/repositórios exportados por `@revezo/db` (proibindo import direto de `prisma` em `apps/web/src/app/**`). | **G** |
| **ARCH-07** | **Média** | `packages/db/src/transactions.ts`, `packages/db/src/audit.ts`, `packages/domain/src/authz/scope.ts`, `apps/web/src/app/perfil/PerfilClient.tsx` | **Uso generalizado de `any` e `as any`** (ex.: `scope.ts:100,141,173,218`, `audit.ts:144,321,341`, `transactions.ts:1596,2162,3209,3366,3857,4299`, `PerfilClient.tsx:142,156`, `ProgramasClient.tsx:190,216,800`). | Anula as garantias do `strict: true` em filtros de escopo de segurança (`scope.ts`) e queries do Prisma, violando `.agent/rules/02-codigo.md`. | Substituir `Record<string, any>` por tipos gerados do Prisma (`Prisma.UserWhereInput`, `Prisma.AssignmentWhereInput`, `Prisma.InputJsonValue`) e interfaces explícitas nos Client Components. | **M** |
| **ARCH-08** | **Baixa** | `apps/web/package.json:33,36` vs `docs/adr/` | As dependências `papaparse` e `xlsx` (SheetJS) foram adicionadas em `apps/web/package.json` sem um ADR específico em `docs/adr/` documentando a escolha (especialmente relevante porque `xlsx` no npm público é pesado e historicamente requer atenção a versões). | Desalinhamento com a restrição *"Sem serviço pago ou dependência pesada sem ADR aprovado em docs/adr/"*. | Registrar ADR para importação de planilhas ou substituir o parser de CSV/XLSX no cliente por processamento leve no servidor. | **P** |
| **ARCH-09** | **Baixa** | `apps/web/src/lib/client.ts`, `apps/web/src/lib/server.ts`, `apps/web/src/lib/middleware.ts` | Três arquivos de código morto do Supabase Auth (`createBrowserClient`, `createServerClient`, `updateSession`) que nunca são importados em nenhum lugar do sistema. | Confunde desenvolvedores e auditores sobre qual mecanismo de autenticação está ativo (`auth-service.ts` vs Supabase Auth). | Remover `src/lib/client.ts`, `src/lib/server.ts` e `src/lib/middleware.ts`. | **P** |

---

### 4.5. UI/UX, Acessibilidade Mobile (WCAG) e Fuso Horário

| ID | Severidade | Local (`arquivo:linha`) | Problema | Impacto | Recomendação | Esforço |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **UX-01** | **Alta** | `apps/web/src/app/layout.tsx:44-50` | **Bloqueio de zoom no celular**: `export const viewport: Viewport = { ..., maximumScale: 1, userScalable: false };`. | Viola diretamente o critério **WCAG 2.1 AA 1.4.4 (Resize Text)** e a skill `.agent/skills/acessibilidade-mobile/SKILL.md`, impedindo que membros idosos ou com baixa visão ampliem a tela com movimento de pinça. | Remover `maximumScale: 1` e `userScalable: false` do objeto `viewport` em `apps/web/src/app/layout.tsx`. | **P** |
| **UX-02** | **Média** | `apps/web/src/app/escalas/page.tsx:62` e `EscalasClient.tsx:445-463` | Na página `/escalas`, `isManagerOrAdmin` é calculado como um booleano único se o usuário for gestor de *qualquer* departamento. `EscalasClient` exibe os botões **"Escalar voluntário"** e **"Remover"** em slots de **todos** os departamentos, inclusive naqueles em que o usuário é apenas membro comum. | Ao tentar clicar para escalar ou remover em outro departamento, o usuário recebe erro `403 Forbidden` da API, gerando confusão e frustração na interface. | Passar `managedDepartmentIds: string[]` para `EscalasClient` e exibir os controles de edição apenas quando `isAdmin || isPastor || isElder || managedDepartmentIds.includes(slot.departmentId)`. | **P** |
| **UX-03** | **Média** | `apps/web/src/app/minha-escala/MinhaEscalaClient.tsx:63-66, 172-182`, `trocas/TrocasClient.tsx:359-360`, `programas/ProgramasClient.tsx:493-498`, `components/CalendarMonthView.tsx:82, 160` | **Datas e horários formatados sem `timeZone: 'America/Sao_Paulo'`**: diversos Client Components chamam `.toLocaleDateString('pt-BR', ...)` e `.toLocaleTimeString('pt-BR', ...)` sem especificar `timeZone: 'America/Sao_Paulo'`. | Causa divergência entre o HTML renderizado no servidor (se o servidor rodar em UTC na Vercel, resultando em Hydration Mismatch no React 19) e dispositivos com fuso diferente de Brasília. | Padronizar `timeZone: 'America/Sao_Paulo'` em todas as chamadas `toLocaleDateString`/`toLocaleTimeString` ou reutilizar `formatScheduleDateTimePtBr` de `@revezo/domain`. | **P** |
| **UX-04** | **Média** | `MinhaEscalaClient.tsx:253`, `ProgramasClient.tsx:558`, `TrocasClient.tsx:555`, `MembrosClient.tsx:831,1059,1308`, `PerfilClient.tsx:1100,1233,1286` | **Modais sem semântica de acessibilidade (`role="dialog"`, `aria-modal="true"`)**: os modais são `<div className="fixed inset-0 ...">` comuns, sem `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, trap de foco por teclado ou fechamento via tecla `Escape`. | Usuários de leitores de tela (VoiceOver/TalkBack) e navegação por teclado continuam navegando nos elementos de fundo por trás do modal aberto. | Criar um componente `<Modal titleId="..." onClose={...}>` reutilizável (ou usar `<dialog>` nativo) com `role="dialog"`, `aria-modal="true"`, listener de `Escape` e gerenciamento de foco. | **M** |
| **UX-05** | **Média** | `TrocasClient.tsx:180, 390`, `DepartamentosClient.tsx:218`, `EscalasClient.tsx:206`, `ChurchSelector.tsx:50, 53` | Uso de diálogos nativos do navegador (`window.confirm()`, `window.prompt()`, `window.alert()`) para ações críticas como recusar troca com motivo, remover voluntário da escala e desvincular membro. | Diálogos nativos bloqueiam a thread principal, não seguem o design system e falham ou têm comportamento ruim em WebViews mobile (Capacitor/PWA instalado). | Substituir `confirm()`, `prompt()` e `alert()` por modais de confirmação e banners (`AlertBanner`) do próprio design system. | **M** |
| **UX-06** | **Baixa** | `apps/web/src/app/membros/MembrosClient.tsx` (1.807 linhas), `PerfilClient.tsx` (1.353 linhas), `ProgramasClient.tsx` (1.047 linhas) | Páginas inteiras marcadas com `"use client"` concentrando listagem estática, filtros, tabelas e 3 a 4 modais pesados num único componente gigante, além da ausência de arquivos `loading.tsx` e `error.tsx` nas rotas do App Router. | Aumenta o JavaScript hidratado no celular e deixa transições entre rotas sem skeleton instantâneo (`loading.tsx`) e sem boundary de erro amigável (`error.tsx`). | Extrair os modais e formulários interativos para subcomponentes dedicados e adicionar `src/app/loading.tsx` e `src/app/error.tsx` em pt-BR. | **M** |

---

## 5. Regras e Boas Práticas Não Aplicadas (Com Exemplos Antes e Depois)

### 5.1. Invariantes de Domínio & Controle de Concorrência (DDD + ADR-004)
- **Princípio violado:** *Aggregate Invariants & Pessimistic Locking (`ADR-004`)*. As regras invioláveis de conflito e limite diário deveriam ser um portão único e intransponível com lock por usuário no banco, mas foram reimplementadas manualmente apenas em `assignMemberWithLock` (sem lock real) e esquecidas em `applyAutoScheduleWithLock`, `adjustAndApproveScheduleAssignmentWithAudit` e `approveSwapRequestWithLock`.
- **Onde ocorre:** `packages/db/src/transactions.ts:46-219` e `3483-3572`.
- **Antes (`packages/db/src/transactions.ts:3550-3555`):**
```ts
// Cria a escala diretamente sem lock no usuário e sem chamar checkEligibility!
const newAssignment = await tx.assignment.create({
  data: {
    slotId: slot.id,
    userId: item.userId,
    status: targetStatus,
  },
});
```
- **Depois (Recomendado):**
```ts
// 1. Adquire advisory lock transacional no PostgreSQL para serializar operações do mesmo voluntário (ADR-004)
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.userId}))`;

// 2. Carrega estado fresco dentro da transação (incluindo PENDING_APPROVAL!) e valida pelo domínio puro
const candidate = await loadCandidateForEligibility(tx, item.userId);
const eligibility = checkEligibility(candidate, {
  id: slot.id,
  departmentId: slot.departmentId,
  functionId: slot.functionId,
  startsAt: slot.startsAt,
  endsAt: slot.endsAt,
});

if (!eligibility.eligible) {
  throw new Error(eligibility.messagePtBr);
}

const newAssignment = await tx.assignment.create({
  data: { slotId: slot.id, userId: item.userId, status: targetStatus },
});
```

---

### 5.2. Don't Repeat Yourself (DRY) e Consistência de Estado na Substituição Automática
- **Princípio violado:** *DRY*. A montagem de candidatos e chamada a `findBestSubstituteCandidate` foi triplicada em `transactions.ts`, omitindo `statsMap` em dois lugares e deixando a escala substituída com status `'DECLINED'` em vez de `'SUBSTITUTED'`.
- **Onde ocorre:** `packages/db/src/transactions.ts:897-907` (`consumeConfirmationTokenWithAudit`), `1779-1783` (`removeDepartmentMemberInternal`) e `2624-2660` (`declineWithAutoSubstitution`).
- **Antes (`packages/db/src/transactions.ts:897-907`):**
```ts
const subResult = findBestSubstituteCandidate({
  candidates,
  slot: slotReq,
  declinedUserIds,
  // statsMap foi esquecido aqui! Todos empatam com carga 0.
});
```
- **Depois (Recomendado):**
```ts
// Helper único reutilizado nos 3 fluxos:
const subResult = await findAndAssignSubstituteInTx(tx, {
  originalAssignment: assignment,
  slot: assignment.slot,
  actorId,
  ip,
});
// Internamente:
// 1) Calcula statsMap filtrando por slot.startsAt nos últimos 60 dias e por userId IN (memberIds)
// 2) Se encontrar substituto, atualiza a escala original para status: 'SUBSTITUTED' (para sair de /slots-abertos)
// 3) Retorna dados para disparar notificação TANTO ao substituto QUANTO aos gestores do departamento
```

---

### 5.3. Princípio do Menor Privilégio e Minimização de Dados no Servidor (LGPD / Clean Architecture)
- **Princípio violado:** *Server-Side Data Minimization (`.agent/rules/13-seg-dados-criptografia.md`)*. Mascarar dados pessoais apenas na renderização do React (`MembrosClient.tsx:693-695`) ainda entrega os dados brutos na rede (payload RSC).
- **Onde ocorre:** `apps/web/src/app/membros/page.tsx:90-114` e `MembrosClient.tsx:693-695`.
- **Antes (`apps/web/src/app/membros/page.tsx:90-108`):**
```ts
const serializedMembers = members.map((m) => ({
  id: m.id,
  name: m.name,
  email: m.email, // Enviado em texto claro para o navegador de qualquer usuário!
  phonePrimary: m.phonePrimary, // Enviado em texto claro!
  birthDate: m.birthDate ? m.birthDate.toISOString().split('T')[0] : null,
  // ...
}));
```
- **Depois (Recomendado):**
```ts
const serializedMembers = members.map((m) => {
  const canViewFullPii =
    isAdmin ||
    isPastor ||
    isElder ||
    m.id === session.userId ||
    m.memberships.some((mem) => managedDeptIds.includes(mem.departmentId));

  return {
    id: m.id,
    name: m.name,
    email: canViewFullPii ? m.email : maskEmail(m.email),
    phonePrimary: canViewFullPii && m.phonePrimary ? m.phonePrimary : maskPhoneNumber(m.phonePrimary ?? ''),
    birthDate: canViewFullPii && m.birthDate ? m.birthDate.toISOString().split('T')[0] : null,
    // ...
  };
});
```

---

### 5.4. Fail-Closed para Segredos de Produção (SecOps — Regra 14)
- **Princípio violado:** *Fail-Closed Configuration (`.agent/rules/14-seg-segredos-config.md`)*. Segredos criptográficos nunca devem ter valor padrão previsível em produção.
- **Onde ocorre:** `apps/web/src/lib/auth-service.ts:29`.
- **Antes:**
```ts
const SESSION_SECRET = process.env.AUTH_SECRET || 'chave-secreta-padrao-desenvolvimento-revezo-32b';
```
- **Depois (Recomendado):**
```ts
function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configuração crítica ausente: AUTH_SECRET deve ter pelo menos 32 caracteres em produção.');
    }
    return 'chave-secreta-padrao-desenvolvimento-revezo-32b';
  }
  return secret;
}
const SESSION_SECRET = getSessionSecret();
```

---

## 6. Plano de Ação Priorizado

### Fase 1: Quick Wins (Até 1 Dia — Alto Impacto / Baixo Esforço)
1. **[SEC-01 & OPS-01]** Remover fallback de `AUTH_SECRET` em produção (`apps/web/src/lib/auth-service.ts:29`) e corrigir `NEXTAUTH_SECRET` -> `AUTH_SECRET` em `.github/workflows/ci.yml:67` e `nightly.yml:41`.
2. **[SEC-02]** Corrigir IDOR nas Server Actions `confirmAction` e `declineAction` (`apps/web/src/app/page.tsx:166-193`, `minha-escala/page.tsx:50-88` e `packages/db/src/transactions.ts:262,2449`) validando titularidade (`assignment.userId === session.userId`).
3. **[SEC-03]** Remover ou restringir a `NODE_ENV === 'test'` o token mágico `e2e-token-valido-teste` em `apps/web/src/app/confirmar/[token]/page.tsx:32-51`.
4. **[SEC-05 & SEC-06]** Mover o mascaramento de PII para os Server Components (`membros/page.tsx`, `departamentos/page.tsx`, `aprovacoes/page.tsx`) e exigir `departmentId` com validação de escopo em `/api/aprovacoes/aprovar` e `/api/aprovacoes/rejeitar`.
5. **[UX-01 & UX-02 & UX-03]** Habilitar zoom no celular removendo `maximumScale: 1, userScalable: false` em `apps/web/src/app/layout.tsx:48-49`; restringir botões de gestão em `EscalasClient.tsx` aos departamentos gerenciados pelo usuário; e adicionar `timeZone: 'America/Sao_Paulo'` nas formatações de data do cliente.
6. **[ARCH-02]** Corrigir `Date.UTC` em `createBatchProgramsWithAudit` (`packages/db/src/transactions.ts:4480,4499-4500`) para converter o horário a partir de `America/Sao_Paulo`.
7. **[SEC-08, SEC-09, SEC-10, SEC-11 & ARCH-09]** Limpar cache do Service Worker no logout, validar `from` contra Open Redirect no login, aplicar fail-closed em `/api/webhooks/whatsapp` e remover código morto do Supabase (`src/lib/{client,server,middleware}.ts` e pacotes `@supabase/*`).

### Fase 2: Curto Prazo (1 a 2 Semanas — Consistência Transacional, Regras 1–5 e LGPD)
1. **[ARCH-01 & PERF-05]** Implementar `pg_advisory_xact_lock(hashtext(userId))` e validação obrigatória via `checkEligibility` em **todos** os pontos que criam ou transferem `Assignment` (`assignMemberWithLock`, `applyAutoScheduleWithLock`, `adjustAndApproveScheduleAssignmentWithAudit`, `respondSwapRequestWithAudit`, `approveSwapRequestWithLock`, `declineWithAutoSubstitution`), incluindo escalas em `PENDING_APPROVAL` nas queries de conflito, e criar migration com `@@unique([slotId, userId])` e `@@unique([assignmentId, kind, channel])` em `NotificationLog`.
2. **[ARCH-05 & Regra 4]** Unificar as 3 implementações de substituição automática em um único helper transacional que:
   - Calcule sempre `statsMap` por `slot.startsAt` filtrando pelos candidatos do departamento (`PERF-03`);
   - Atualize a escala original para `SUBSTITUTED` quando houver substituto;
   - Notifique **tanto o substituto quanto os gestores do departamento** (e envie alerta de `OPEN_SLOT` aos gestores quando não houver candidato elegível ou quando a geração automática deixar vagas abertas);
   - Chame `notifyAutoSubstitution` também na Server Action do Dashboard (`apps/web/src/app/page.tsx:179-193`).
3. **[SEC-04]** Corrigir a criptografia LGPD em `registerVolunteer` e `updateUserProfileWithAudit` para não persistir `address`, `emergencyContact` e `notes` em texto claro, e salvar `isMinor`, `guardianName`, `guardianPhone` (criptografado) e `guardianConsentAt` no autocadastro.
4. **[SEC-07]** Resolver o loop infinito de redirecionamento entre `middleware.ts` e `page.tsx` para cookies expirados e implementar invalidação de sessão web pós-reset de senha.
5. **[PERF-01 & PERF-02]** Otimizar `/api/cron/reminders` (eliminar N+1 de `featureFlag` e `churchSettings`, configurar `maxDuration`) e ajustar `batchImportMembersWithAudit` e `createBatchProgramsWithAudit` com pré-busca e timeout transacional adequado (`30000ms`).

### Fase 3: Médio e Longo Prazo (Arquitetura, UX e Qualidade Contínua)
1. **[ARCH-04 & ARCH-06]** Fatiar `packages/db/src/transactions.ts` (4.808 linhas) em módulos por domínio e encapsular as queries diretas de `apps/web` em repositórios/serviços de `@revezo/db`.
2. **[ARCH-07]** Eliminar os usos de `any` e `as any` em `packages/db`, `packages/domain/src/authz/scope.ts` e `apps/web`.
3. **[UX-04, UX-05 & UX-06]** Criar componente `<Modal>` acessível (`role="dialog"`, `aria-modal="true"`, trap de foco e `Escape`), substituir todos os `confirm()`/`prompt()`/`alert()` nativos e adicionar `loading.tsx` e `error.tsx`.
4. **[OPS-02 & OPS-03]** Configurar serviço PostgreSQL no job `e2e-smoke` do `nightly.yml` e incluir `pnpm test:mutation` (Stryker expandido para `eligibility.ts`, `auto-scheduler.ts`, `ranking.ts` e `can.ts`) na rotina noturna.

---

## 7. Limitações da Análise (Itens "Não Verificados")

Em conformidade com as regras do modo de trabalho (análise estritamente **somente leitura** e sem invenção de problemas):

1. **Valores das variáveis de ambiente de produção e GitHub Secrets (`não verificado`)**: Por respeito estrito à Regra 18 (`.agent/rules/18-seg-agente-ia.md`), nenhum arquivo `.env`, `.env.local` ou `.env.test` foi lido, e não há acesso às configurações remotas da Vercel ou do GitHub Secrets.
2. **Execução dinâmica da suíte de testes, mutação e banco ao vivo (`não verificado`)**: Como a auditoria foi conduzida em modo somente leitura sem iniciar containers Docker ou processos de build/teste que alterem artefatos locais, a validação foi feita por inspeção estática integral do código-fonte e dos 39 arquivos de teste.
3. **Métricas de campo de Core Web Vitals (LCP, INP, CLS em dispositivos reais) e planos contratados na nuvem (`não verificado`)**: Não há telemetria de produção anexada ao repositório; a análise de performance baseou-se na estrutura dos componentes React/Next.js, tamanho das dependências, queries Prisma e limites oficiais documentados dos provedores.
