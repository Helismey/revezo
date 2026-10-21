---
name: revisao-de-codigo
description: "Use para revisar mudanças antes de merge: segurança, desempenho, correção e manutenibilidade."
---

# Revisão de código

Avaliar em quatro eixos:
- **Segurança**: autorização no servidor, injeção, XSS, CSRF, segredos no código, exposição de dados pessoais (ver rule 03).
- **Desempenho**: N+1, consultas sem limite ou índice, cálculo pesado em caminho quente, uso de Client Component sem necessidade.
- **Correção**: bordas (vazio, nulo, virada de dia, fuso), concorrência (duas trocas ao mesmo tempo), erros tratados, regras de negócio da rule 00.
- **Manutenibilidade**: nomes, responsabilidade única, duplicação, testes, documentação de lógica não óbvia.

Saída: resumo, tabela de problemas críticos (arquivo, linha, problema, severidade), sugestões, pontos positivos e veredito (Aprovar, Pedir mudanças, Discutir).
