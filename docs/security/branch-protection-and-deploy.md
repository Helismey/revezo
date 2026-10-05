# Proteção de Branch e Segurança de Deploy (CI/CD)

**Data de Revisão:** 05/10/2026  
**Referência:** `.agent/rules/15-seg-dependencias-cicd.md` e Skill `seguranca-dependencias-cicd`

---

## 1. Regras de Proteção da Branch Principal (`main`)

A branch `main` é a fonte canônica do código em produção. O acesso a ela é estritamente controlado por políticas no GitHub:

| Regra de Proteção | Configuração | Objetivo |
|---|---|---|
| **Pull Request Obrigatório** | Ativo (`Require a pull request before merging`) | Nenhum commit direto na `main`. Todo código passa por revisão e histórico de PR. |
| **Aprovações Mínimas** | 1 revisão de mantenedor responsável | Evita merges acidentais ou não revisados. |
| **Status Checks Obrigatórios** | Ativo (`Require status checks to pass before merging`) | O merge é bloqueado se qualquer job do CI falhar. |
| **Checks Exigidos** | • `Lint & Typecheck`<br>• `Unit Tests`<br>• `Build`<br>• `Audit`<br>• `Gitleaks`<br>• `CodeQL` | Garantia de qualidade de tipos, cobertura de testes, compilação de assets, auditoria de pacotes e varredura de segredos. |
| **Branch Atualizada** | Ativo (`Require branches to be up to date before merging`) | Garante que o PR foi testado contra a versão mais recente da `main` antes do merge. |
| **Sem Force-Push** | Ativo (`Do not allow force pushes`) | Preserva o histórico imutável de commits e impede sobrescrita da `main`. |
| **Sem Exclusão** | Ativo (`Do not allow deletions`) | Impede exclusão acidental da branch principal. |

---

## 2. Segurança de Segredos e Ambientes de Deploy

### 2.1 Separação Estrita de Ambientes

| Ambiente | Banco de Dados | Segredos Utilizados | Acesso a Dados Reais |
|---|---|---|:---:|
| **Desenvolvimento Local** | PostgreSQL local via Docker ou banco de teste isolado | `.env` local (ignorado pelo `.gitignore`) | ❌ Apenas seed fictício (`pnpm seed`) |
| **CI / Pull Requests** | Banco transitório de teste em memória/container | Valores dummy e fixos para teste (`.env.test.example`) | ❌ Proibido dados reais |
| **Preview Deployments** | Banco de dados de staging / preview temporário | Segredos com escopo exclusivo de preview | ❌ Proibido dados reais de membros |
| **Produção** | Supabase / Neon PostgreSQL com TLS e pooling | GitHub Secrets com ambiente `production` restrito à branch `main` | ✅ Dados da congregação protegidos por AES-256-GCM e RBAC |

### 2.2 Isolamento de PRs de Forks
- Conforme regra 15: **PRs originados de forks NÃO têm acesso aos secrets do repositório**.
- O GitHub Actions roda em modo somente-leitura (`permissions: contents: read`) para eventos de `pull_request` vindos de terceiros.

---

## 3. Políticas de Dependências e Supply Chain

1. **Lockfile Obrigatório**:
   - `pnpm-lock.yaml` é versionado no Git.
   - Todo pipeline de CI instala com `pnpm install --frozen-lockfile`. Nenhuma versão flutuante é resolvida no CI.
2. **Bloqueio de Scripts de Instalação (`allowBuilds`)**:
   - Em `pnpm-workspace.yaml`, apenas binários explicitamente auditados podem executar hooks de build (`@prisma/client`, `@prisma/engines`, `esbuild`, `prisma`). Qualquer script `postinstall` de pacotes de terceiros é bloqueado por padrão.
3. **Auditoria de Vulnerabilidades (`pnpm audit`)**:
   - O job `audit` em `.github/workflows/ci.yml` executa `pnpm audit --audit-level=high` e bloqueia merges em caso de vulnerabilidades altas ou críticas sem mitigação documentada.
4. **Dependabot Automatizado**:
   - `.github/dependabot.yml` configurado para varredura semanal (segunda-feira) agrupando updates do Next.js, Prisma, TypeScript tooling e GitHub Actions.
5. **Varredura Contínua de Segredos**:
   - Workflow `.github/workflows/security.yml` executa Gitleaks em todo o histórico (`fetch-depth: 0`) e CodeQL estático em cada PR e push na `main`.
