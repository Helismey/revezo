---
name: testes-integracao-banco
description: "Use ao escrever testes de integração com PostgreSQL real: transações, consultas por escopo, migrations, cron e Server Actions."
---

# Integração com banco

- PostgreSQL real (contêiner no CI; `docker compose` local). Proibido mockar banco ou Prisma aqui.
- Isolamento: banco limpo por execução, e cada teste em transação revertida ou em schema próprio por worker.
- Migrations: aplicar todas do zero e conferir que o schema final bate com `schema.prisma`.
- Consultas por escopo: gestor A não lê nem altera dados do departamento B (IDOR).
- Transações: atribuição valida conflito e limite dentro da transação com bloqueio (ADR-004). Ver skill `testes-de-concorrencia`.
- Server Actions e rotas: criar sessão de teste pelo mesmo mecanismo do login; verificar permissões, validação Zod e efeitos no banco.
- Cron de lembretes: executar duas vezes e afirmar que não duplica envios (idempotência por assignment + tipo).
- Constraints e índices: violação de unicidade e chaves estrangeiras produzem erros tratados, sem vazar detalhes.
- Dados: fábricas com semente fixa; sem dados reais.
