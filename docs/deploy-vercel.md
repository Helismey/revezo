# Guia de Deploy no Vercel — Revezo

Este guia documenta o passo a passo para implantar o sistema **Revezo** no Vercel com segurança, aproveitando o monorepo Turborepo, Next.js (App Router), Prisma e PostgreSQL no Supabase/Neon.

---

## 1. Configurações do Projeto no Vercel Dashboard

Ao importar o repositório no [Vercel Dashboard](https://vercel.com/new):

1. **Framework Preset**: `Next.js`
2. **Root Directory**: Clique em *Edit* e selecione `apps/web`.
   - ✅ Deixe marcada a opção: *"Include source files outside of the Root Directory in the Build Step"* (padrão no Vercel para monorepos Turborepo).
3. **Build & Development Settings**:
   - **Build Command**: Deixe o padrão ou defina explicitamente:
     ```sh
     pnpm exec turbo run build --filter=@revezo/web...
     ```
   - **Install Command**:
     ```sh
     pnpm install
     ```
   - **Output Directory**: `.next`

---

## 2. Variáveis de Ambiente (Environment Variables)

Configure no painel da Vercel (*Settings > Environment Variables*) para os ambientes **Production** e **Preview**:

### 2.1 Banco de Dados (PostgreSQL / Supabase / Neon)
> [!IMPORTANT]
> Em ambientes serverless como a Vercel, o `DATABASE_URL` **deve** apontar para o pooler em modo de transação com limite de conexão por container lambda.

| Variável | Descrição | Exemplo |
|---|---|---|
| `DATABASE_URL` | Conexão via **Transaction Pooler** (porta 6543) com `pgbouncer=true` e `connection_limit=1` | `postgres://postgres.[ref]:[pwd]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Conexão direta ao banco (porta 5432), usada para migrations | `postgres://postgres.[ref]:[pwd]@aws-0-[region].supabase.com:5432/postgres` |

### 2.2 Autenticação e Segurança
| Variável | Descrição | Como gerar |
|---|---|---|
| `AUTH_SECRET` | Chave secreta para criptografia de sessões e cookies HttpOnly | `openssl rand -hex 32` |
| `CRON_SECRET` | Chave para autorizar as rotas do Vercel Cron (`/api/cron/*`) | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | URL pública da aplicação | `https://escala-revezo.vercel.app` |

### 2.3 Supabase Client (se utilizado)
| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL da instância Supabase (`https://[ref].supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública `anon` |

### 2.4 Notificações e Otimizações (Opcional no início)
- `RESEND_API_KEY` / `EMAIL_FROM`: Para envio de e-mails no tier gratuito.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`: Para Web Push PWA.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: Para rate limiting serverless distribuído (fallback em memória automático se ausente).
- `WHATSAPP_PROVIDER`: `simulation` (padrão seguro até configurar Meta/Evolution/Z-API).

---

## 3. Banco de Dados e Migrations

Antes de liberar para tráfego de produção, aplique as migrations do Prisma diretamente a partir de um terminal seguro:

```powershell
# Aplicar migrations pendentes no banco de produção
pnpm db:migrate:deploy
```

> [!CAUTION]
> Nunca execute `prisma db push` em banco com dados reais de produção. Use sempre `prisma migrate deploy`.

---

## 4. Rotas do Vercel Cron

O arquivo [apps/web/vercel.json](file:///c:/Users/helismey.silva/.gemini/antigravity/scratch/escala-igreja/apps/web/vercel.json) já está configurado:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 11 * * *"
    },
    {
      "path": "/api/cron/keepalive",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- **Lembretes (`/api/cron/reminders`)**: Disparado diariamente às 11:00 UTC (08:00 BRT).
- **Keepalive (`/api/cron/keepalive`)**: Ping diário às 06:00 UTC para evitar que instâncias gratuitas do Supabase/Neon pausem por inatividade.
- **Autenticação**: O Vercel Cron envia automaticamente o header `Authorization: Bearer <CRON_SECRET>` definido nas variáveis de ambiente. As rotas aceitam requisições HTTP `GET`.

---

## 5. Checklist Pré-Deploy e Smoke Tests

Siga o checklist operacional em [docs/deploy-checklist.md](file:///c:/Users/helismey.silva/.gemini/antigravity/scratch/escala-igreja/docs/deploy-checklist.md):
1. ✅ Testes automatizados passando (`pnpm test:unit`, `pnpm test:matrix`, `pnpm test:concurrency`).
2. ✅ Build sem erros (`pnpm run build`).
3. ✅ Variáveis de ambiente configuradas no Vercel.
4. ✅ Migrations aplicadas no banco PostgreSQL.
5. ✅ Deploy em Preview testado (login, visualização de escala, confirmação de token).
