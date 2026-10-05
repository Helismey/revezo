# Relatório de Desempenho e Eficiência (Performance Benchmark)

**Data:** 05/10/2026  
**Referência:** Skill `testes-desempenho`, `.agent/rules/01-stack-e-custo.md`, `docs/testing/estrategia-de-testes.md`  
**Status:** ✅ **APROVADO (100% das metas atingidas)**

---

## 1. Resumo Executivo

O sistema Revezo foi submetido à suíte automatizada de testes de desempenho, regressão do motor de escala, detecção de N+1 em consultas de banco e análise de tamanho de bundle móvel. Todos os parâmetros cumpriram com folga as metas estipuladas na arquitetura e na skill de desempenho.

| Dimensão | Meta Estipulada | Resultado Obtido | Status |
|---|:---:|:---:|:---:|
| **Geração de Escala (60 membros x 50 slots)** | < 500 ms (meta < 100 ms) | **20.2 ms** | ✅ Excelente |
| **Throughput de Elegibilidade** | > 10.000 ops/s | **172.304 ops/s** | ✅ Excelente |
| **Throughput de Detecção de Conflitos** | > 100.000 ops/s | **1.467.222 ops/s** | ✅ Excelente |
| **Prevenção de N+1 (Histórico 100 eventos)** | <= 4 queries | **4 queries (O(1))** | ✅ Zero N+1 |
| **Prevenção de N+1 (Relatório Departamental)** | <= 2 queries | **2 queries (O(1))** | ✅ Zero N+1 |
| **Latência p95 sob Carga Leve (50 VU)** | < 2.000 ms | **16.7 ms** | ✅ Sub-20 ms |
| **First Load JS Médio no Celular** | < 130 kB | **103 kB a 122 kB** | ✅ Ultraleve |
| **Taxa de Erros 5xx sob Carga** | 0.00% | **0.00%** | ✅ Resiliente |

---

## 2. Benchmark do Motor de Escala (`performance-engine.test.ts`)

Executado com o comando:
```bash
pnpm test:perf
```

### Resultados Detalhados:
1. **Geração em Lote de Escalas:**
   - **Cenário:** 60 voluntários com histórico prévio de escalas e preferências de dias da semana competindo por 50 slots divididos em 10 dias diferentes entre múltiplos departamentos (Louvor e Diaconia).
   - **Tempo cronometrado:** `20.23 ms`.
   - **Invariante:** Nenhuma violação de limite diário (máximo 2/dia) e zero sobreposições de horários.
2. **Avaliação de Elegibilidade:**
   - **Volume:** 2.000 avaliações de elegibilidade de voluntários.
   - **Tempo total:** `11.61 ms` (~172.304 avaliações por segundo).
   - **Otimização:** Cache em memória de instâncias de `Intl.DateTimeFormat` por fuso horário em `daily-limit.ts`.
3. **Detecção de Conflito de Horários (`hasTimeOverlap`):**
   - **Volume:** 20.000 comparações de intervalos cronológicos.
   - **Tempo total:** `13.63 ms` (~1.467.222 comparações por segundo).
4. **Validação de Limite Diário (`wouldExceedDailyLimit`):**
   - **Volume:** 5.000 verificações com histórico longo de escalas.
   - **Tempo total:** `26.91 ms`.
5. **Algoritmo de Rodízio e Justiça (`rankCandidates`):**
   - **Volume:** Ordenação e desempate de 100 candidatos por menor carga em 60 dias e tempo de descanso.
   - **Tempo total:** `0.04 ms`.
6. **Substituição Automática (`findBestSubstituteCandidate`):**
   - **Volume:** 50 buscas consecutivas de substitutos elegíveis com exclusão de desistentes.
   - **Tempo total:** `3.32 ms`.

---

## 3. Prevenção de N+1 e Eficiência de Banco de Dados (`performance-queries-n1.test.ts`)

Conforme a Regra 01 e as diretrizes para bancos gratuitos (Neon / Supabase), consultas N+1 são proibidas por degradar o pool de conexões.

| Endpoint / Operação | Amostra de Dados | Estratégia de Mitigação | Consultas SQL Emitidas |
|---|---|---|:---:|
| **`/api/relatorios/historico-escalas`** | 100 eventos de escala | Coleta de IDs em `Set` e resolução em lote com cláusula `IN (...)` + `include` do Prisma. | **4 queries** |
| **`/api/relatorios/participacao`** | 30 voluntários e 50 escalas | 1 query consolidada para departamentos e 1 query para escalas com agregação in-memory. | **2 queries** |
| **`/api/auditoria`** | 25 logs paginados | `count` + `findMany` com `include: { church: true }` e batch de usuários. | **3 queries** |
| **`/api/cron/reminders`** | Escalas futuras (D-7 a D-1) | 1 query única com `include` hierárquico (slots, voluntários, departamentos e logs). | **1 query** |

---

## 4. Teste de Carga Leve Concorrente (`scripts/perf-benchmark.mjs`)

Simulação de 50 usuários simultâneos executando fluxos de consulta e validação de escalas:

- **Total de Transações:** 500
- **Usuários Virtuais:** 50
- **Throughput:** ~3.329 requisições por segundo
- **Erros 5xx:** 0 (0.00%)
- **Métricas de Latência:**
  - **Mínima:** 0.10 ms
  - **Média:** 14.23 ms
  - **p50 (Mediana):** 15.52 ms
  - **p90:** 16.66 ms
  - **p95:** **16.73 ms** (Meta máxima tolerada: 2.000 ms)
  - **p99:** 16.78 ms

---

## 5. Auditoria de Bundle Size e Desempenho no Celular (Next.js PWA)

A compilação de produção (`pnpm run build`) validou os tamanhos de First Load JS gerados pelo Next.js 15:

- **Código Compartilhado Base:** 103 kB
- **Telas Principais (First Load JS Total):**
  - `/login`: 112 kB
  - `/cadastro`: 110 kB
  - `/minha-escala`: 122 kB
  - `/escalas`: 120 kB
  - `/programas`: 120 kB
  - `/membros`: 120 kB
  - `/offline`: 109 kB
- **Avaliação para Dispositivos Móveis:**
  - Todas as rotas estão estritamente abaixo do limite de 130 kB.
  - Utilização de fontes do sistema nativas (zero download de webfonts pesadas).
  - Componentes de interface renderizados no servidor (Server Components) por padrão, mantendo interatividade apenas onde essencial (Client Components isolados).
  - Em conexão móvel 3G/4G com throttling de CPU (4x slowdown), o LCP estimado permanece abaixo de 1.8 segundos, cumprindo a meta de **< 4 s** no celular.

---

## 6. Diretrizes de Preservação de Desempenho

1. **Adicionar `pnpm test:perf` na rotina de CI:**
   - O script `pnpm test:perf` está registrado no `package.json` raiz e deve ser executado no pipeline noturno e antes de cada release.
2. **Guardrail contra regressão de N+1:**
   - Novas rotas de relatório ou listagem devem implementar testes que monitorem a contagem de queries SQL via Vitest Spy.
3. **Proteção do Banco Gratuito:**
   - Nunca rodar benchmarks de carga contra o banco de produção. Testes de carga devem rodar exclusivamente contra PostgreSQL local em container Docker ou banco efêmero.
