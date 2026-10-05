# Relatório de Execução: Testes de Integração com Banco de Dados Real (PostgreSQL)

**Data:** 05/10/2026  
**Skill:** `.agent/skills/testes-integracao-banco/SKILL.md`  
**Comando oficial:** `pnpm test:int`  
**Banco de Dados:** PostgreSQL 16 / Real local (`escala_test`)  
**Status Geral:** ✅ Aprovado com 100% de Sucesso (17/17 testes passando)

---

## 1. Escopo e Princípios Atendidos

Conforme estipulado na skill `/testes-integracao-banco` e nas regras de arquitetura e segurança (Regras 00, 01, 05, 10, 11, 13, 18 e 19):

1. **Zero Mocks de Banco de Dados:**  
   Nenhum mock de Prisma ou banco de dados foi utilizado na suíte de integração. Todas as operações de criação, atualização, consultas e transações foram executadas diretamente contra instâncias reais do PostgreSQL no banco de dados isolado `escala_test`.
2. **Isolamento de Dados por Execução:**  
   Criado truncador automático em cascata (`resetDatabase()`) executado a cada teste (`beforeEach`), garantindo estado limpo e reprodutibilidade sem interferência entre cenários.
3. **Fábricas Determinísticas Sem Dados Reais (LGPD):**  
   Implementadas fábricas de dados sintéticos (`createTestChurch`, `createTestUser`, `createTestDepartment`, `createTestProgramWithSlot`) utilizando gerador de ID determinístico sequencial e dados fictícios (`@igreja.local`).
4. **Alinhamento Completo de Migrations:**  
   Aplicadas todas as migrations do zero e gerada a migration `20261001020000_minor_protection_and_indexes`, garantindo 0 diferenças com `schema.prisma`.

---

## 2. Cenários e Cobertura dos Testes (`packages/db/test/integration-db.test.ts`)

| Seção | Cenário Testado | Invariante / Regra Validada | Resultado |
|---|---|---|---|
| **1. Migrations e Estrutura** | Aplicação de migrations do zero | Conferência em `_prisma_migrations` (3 migrations finalizadas) | ✅ Aprovado |
| | Existência de tabelas no schema `public` | Tabelas vitais (`Church`, `User`, `Assignment`, etc.) presentes | ✅ Aprovado |
| **2. Transações e Concorrência** | Atribuição válida com lock | Transação atômica cria `Assignment` e gera `AuditLog` | ✅ Aprovado |
| | Conflito de horário | Reversão atômica (rollback) quando horários se sobrepõem | ✅ Aprovado |
| | Limite diário de 2 escalas | Bloqueio imediato da 3ª escala no mesmo dia | ✅ Aprovado |
| | Períodos de indisponibilidade | Bloqueio de voluntário com `UNAVAILABLE_PERIOD` cadastrado | ✅ Aprovado |
| **3. Escopo e Anti-IDOR** | Isolamento Multi-Igreja | Voluntário da Igreja A não pode ser escalado na Igreja B | ✅ Aprovado |
| | Escopo de Departamento (Anti-IDOR) | Gestor do Dep A não tem autorização para escalar no Dep B | ✅ Aprovado |
| | Relatório de Participação | Estatísticas isoladas estritamente por departamento e congregação | ✅ Aprovado |
| | Auditoria por Congregação | `queryAuditLogs` filtra estritamente por `churchId` | ✅ Aprovado |
| **4. Constraints e Integridade** | Unicidade de Departamento por Igreja | Violação de `@@unique([churchId, name])` tratada no DB | ✅ Aprovado |
| | Unicidade de Email | Violação de `@unique` no email de voluntário | ✅ Aprovado |
| | Chave Estrangeira (FK) | Violação referencial ao tentar vincular ID inexistente | ✅ Aprovado |
| | Imutabilidade do `AuditLog` | Bloqueio em runtime de `.update()` e `.delete()` (Regra 19) | ✅ Aprovado |
| **5. Cron e Idempotência** | Idempotência de Lembretes | Execução 1 envia e grava log; Execução 2 detecta log existente e não duplica | ✅ Aprovado |
| **6. Tokens de Presença** | Consumo Único de Link de Confirmação | Token hash-only em `ActionToken`; confirmação atualiza status; reuso é barrado | ✅ Aprovado |
| **7. API Routes e Sessão** | Endpoint `POST /api/escalas/atribuir` | 401 sem autenticação, 400 em payload inválido (Zod), 403 em IDOR, 200 gravando no PostgreSQL | ✅ Aprovado |

---

## 3. Descobertas Técnicas e Correções Efetuadas

1. **Incompatibilidade de `ALTER TYPE ... ADD VALUE` em Migrations:**  
   Em migrações automáticas empacotadas como transações com múltiplos comandos, o PostgreSQL rejeita comandos `ALTER TYPE ... ADD VALUE`. Os enums `GlobalRole` e `AssignmentStatus` foram unificados em `20261001000000_init_schema`, permitindo aplicação idempotente e livre de erros.
2. **Defasagem entre Schema e Banco (Campos LGPD de Menores e Índices):**  
   Ao rodar `prisma migrate diff`, identificou-se que colunas de proteção a menores (`isMinor`, `guardianName`, `guardianPhone`, `guardianConsentAt`) e aprovação de escalas (`approvedAt`, `approvedById`) estavam em `schema.prisma` mas não em migration. Criada a migration `20261001020000_minor_protection_and_indexes`, sincronizando o banco em 100%.
3. **Resiliência de Contexto de Sessão fora do SSR:**  
   As funções `getSession()` e `clearSession()` de `apps/web/src/lib/auth-service.ts` foram protegidas com blocos defensivos em torno de chamadas a `cookies()` de `next/headers`, assegurando funcionamento fluido tanto em SSR, quanto em aplicativos mobile nativos (Capacitor) e testes de integração com banco de dados real.

---

## 4. Métricas e Verificação Final

- **Testes de Integração (`pnpm test:int`):** 17/17 passaram (7.9s).
- **Suíte Completa (`pnpm test`):** 471/471 passaram em 38 arquivos de teste.
- **Checagem de Tipos (`pnpm typecheck`):** 0 erros em todos os 4 pacotes do monorepo.
- **Linter (`pnpm lint`):** 0 violações encontradas.
