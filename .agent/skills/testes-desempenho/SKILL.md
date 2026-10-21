---
name: testes-desempenho
description: "Use para testes de desempenho: geração de escala, telas principais, consultas por tela e regressão de N+1."
---

# Desempenho

- **Motor**: gerar escala para ~60 membros e dezenas de slots; limite de tempo definido (ex.: abaixo de 500 ms) como teste que falha em regressão.
- **Consultas por tela**: teste de integração que conta consultas do Prisma por rota e falha acima do limite (detecta N+1).
- **Carga leve** (k6 ou autocannon, noturno): login, tela inicial, minha escala, agenda, com dezenas de usuários simultâneos; metas: p95 abaixo de 2 s em tela principal, 0% de erros 5xx.
- **Celular**: auditoria Lighthouse (ou equivalente) em perfil de celular médio com rede lenta; acompanhar tamanho do pacote JS.
- Resultados guardados como relatório do CI (pasta ignorada pelo git).
- Banco gratuito: observar limites de conexões e latência ao rodar os testes de carga em ambiente de homologação, nunca em produção.
