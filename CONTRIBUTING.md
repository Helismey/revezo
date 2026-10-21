# Guia de Contribuição — Revezo

Agradecemos pelo seu interesse em contribuir com o **Revezo**! 🎉

O Revezo é um sistema gratuito e open-source para simplificar a gestão de escalas de voluntários e departamentos em igrejas, garantindo privacidade de dados, detecção de conflitos e acessibilidade em dispositivos móveis.

Para manter a qualidade, a segurança e a coerência do projeto, pedimos que leia atentamente as diretrizes abaixo antes de enviar sua contribuição.

---

## 📋 Sumário

- [Código de Conduta](#código-de-conduta)
- [Como Posso Contribuir?](#como-posso-contribuir)
  - [Reportando Bugs](#reportando-bugs)
  - [Sugerindo Novas Funcionalidades](#sugerindo-novas-funcionalidades)
  - [Contribuindo com Código](#contribuindo-com-código)
- [Configuração do Ambiente de Desenvolvimento](#configuração-do-ambiente-de-desenvolvimento)
- [Scripts Úteis](#scripts-úteis)
- [Padrões de Desenvolvimento](#padrões-de-desenvolvimento)
  - [Convenção de Commits](#convenção-de-commits)
  - [Regras de Idioma e UX](#regras-de-idioma-e-ux)
  - [Segurança e Privacidade (LGPD)](#segurança-e-privacidade-lgpd)
- [Processo de Pull Request](#processo-de-pull-request)

---

## Código de Conduta

Ao participar deste projeto, você concorda em seguir nosso [Código de Conduta](CODE_OF_CONDUCT.md). Esperamos respeito mútuo, cordialidade e espírito comunitário de todos os envolvidos.

---

## Como Posso Contribuir?

### Reportando Bugs

Se você encontrou um bug ou comportamento inesperado:
1. Verifique na aba [Issues](https://github.com/Helismey/escala-igreja/issues) se o problema já foi reportado.
2. Se não existir reporte, abra uma nova issue utilizando o modelo **Relato de Bug** (`Bug report`).
3. Forneça o máximo de detalhes possível: passos para reproduzir, comportamento esperado versus observado, prints de tela e navegador/aparelho utilizado.

### Sugerindo Novas Funcionalidades

Ideias e sugestões são muito bem-vindas!
1. Abra uma issue usando o modelo **Sugestão de Funcionalidade** (`Feature request`).
2. Descreva claramente qual problema a funcionalidade resolve, como ela funcionaria na prática e alternativas consideradas.

### Contribuindo com Código

1. Escolha uma issue aberta ou discuta a ideia previamente com os mantenedores.
2. Faça um fork do repositório e crie uma branch a partir da `main`:
   ```bash
   git checkout -b feat/minha-nova-funcionalidade
   ```
3. Implemente as alterações mantendo os testes atualizados.
4. Garanta que linters, typecheck e testes passem localmente antes de abrir o PR.

---

## Configuração do Ambiente de Desenvolvimento

### Pré-requisitos

- **Node.js** (versão 20 LTS ou superior)
- **pnpm** (versão 9.x instalada globalmente: `corepack enable` ou `npm install -g pnpm@9`)
- **Docker** e **Docker Compose** (recomendado para banco de dados local Postgres)

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/Helismey/escala-igreja.git
   cd escala-igreja
   ```

2. **Instale as dependências:**
   ```bash
   pnpm install
   ```

3. **Configure as variáveis de ambiente:**
   ```bash
   cp .env.example .env
   ```
   Ajuste as chaves e credenciais no arquivo `.env` para apontar para sua instância local.

4. **Inicie o banco de dados (se estiver usando Docker):**
   ```bash
   docker compose up -d
   ```

5. **Prepare o banco de dados (migrations e seed de teste):**
   ```bash
   pnpm db:generate
   pnpm db:migrate:dev
   pnpm db:seed
   ```

6. **Inicie a aplicação em modo de desenvolvimento:**
   ```bash
   pnpm dev
   ```
   Acesse a aplicação em [http://localhost:3000](http://localhost:3000).

---

## Scripts Úteis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia a aplicação web em modo de desenvolvimento |
| `pnpm build` | Compila todos os pacotes e a aplicação web |
| `pnpm lint` | Executa a verificação de código e estilo |
| `pnpm typecheck` | Executa a verificação estática de tipos TypeScript |
| `pnpm test` | Executa todos os testes automatizados com Vitest |
| `pnpm test:unit` | Executa os testes unitários do domínio |
| `pnpm test:e2e` | Executa os testes ponta a ponta com Playwright |
| `pnpm db:migrate:dev` | Aplica migrações pendentes do Prisma no banco local |
| `pnpm db:seed` | Popula o banco local com dados fictícios para desenvolvimento |

---

## Padrões de Desenvolvimento

### Convenção de Commits

Utilizamos a convenção [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

- `feat:` Nova funcionalidade para o usuário
- `fix:` Correção de bug
- `docs:` Alterações na documentação
- `style:` Formatação de código sem alteração lógica
- `refactor:` Refatoração de código sem alteração de funcionalidade
- `perf:` Melhoria de desempenho
- `test:` Inclusão ou ajuste de testes
- `chore:` Tarefas de manutenção de build, scripts ou dependências

Exemplos:
```bash
git commit -m "feat(escala): adicionar bloqueio de membro em dois departamentos no mesmo horário"
git commit -m "fix(lembretes): corrigir cálculo de fuso horário no envio de D-1"
```

### Regras de Idioma e UX

- **Interface 100% pt-BR**: Toda a interface visível ao usuário (telas, notificações, botões e mensagens de erro) deve estar em português do Brasil, de forma clara, acolhedora e direta.
- **Foco em Celular**: A experiência mobile é prioritária. Todos os componentes devem ser responsivos, fáceis de tocar (touch target mínimo 44x44px) e rápidos de carregar.

### Segurança e Privacidade (LGPD)

- **Proteção de Dados Pessoais**: Telefones, e-mails e nomes de membros são dados pessoais. NUNCA faça commits contendo dados reais de membros, fotos pessoais ou dumps de bancos produtivos. Use sempre o `pnpm db:seed` com dados fictícios.
- **Segredos**: Nunca versione senhas, tokens ou arquivos `.env`. O repositório possui checagens automáticas com Gitleaks para prevenir segredos expostos.
- **Autorização no Backend**: Toda ação ou consulta sensível deve validar autenticação e permissões (RBAC) no servidor.

---

## Processo de Pull Request

1. Mantenha os Pull Requests focados e pequenos (um assunto por PR).
2. Certifique-se de que `pnpm lint`, `pnpm typecheck` e `pnpm test` passem sem erros.
3. Preencha o [Template de Pull Request](.github/pull_request_template.md) informando o que foi alterado e por quê.
4. Aguarde a revisão de um mantenedor. Se houver sugestões, faça os ajustes na mesma branch do PR.
5. Após aprovação e CI verde, o PR será mesclado na branch `main`.
