# ADR-020: Processamento de Planilhas (CSV e Excel) na Importação de Membros

- **Data:** 2026-10-19
- **Status:** Aceito
- **Relacionado a:** `apps/web/src/app/membros/MembrosClient.tsx`, `packages/contracts/src/member.schema.ts`, `packages/db/src/transactions.ts`

## Contexto
Secretarias e lideranças de igrejas frequentemente mantêm cadastros de voluntários em planilhas CSV ou Excel (`.xlsx` / `.xls`). Para viabilizar a migração sem digitação manual, o sistema precisa ler esses arquivos, apresentar uma prévia validada linha a linha na interface (em português) e importar em lote no servidor com validação Zod e criptografia LGPD.

## Decisão
1. **Leitura e Prévia no Cliente (`papaparse` e `xlsx` sob demanda):**
   - Para arquivos `.csv`, utiliza-se `papaparse` para parsing rápido no navegador com suporte a cabeçalhos em português e inglês.
   - Para arquivos `.xlsx` / `.xls`, utiliza-se `xlsx` (SheetJS) carregado exclusivamente via **importação dinâmica (`await import('xlsx')`)** no momento em que o gestor seleciona uma planilha Excel, evitando incluir o bundle da biblioteca no carregamento inicial da página `/membros`.
2. **Validação Estrita e Sanitização no Servidor:**
   - O cliente envia apenas o array JSON normalizado (`rows`) para `POST /api/membros/importar`, limitado a no máximo 1.000 linhas por lote (`batchImportMembersSchema`).
   - Todas as células passam por validação Zod (`importMemberRowSchema`), normalização de telefone E.164, criptografia AES-256-GCM de observações/responsáveis e prevenção de CSV Formula Injection (`sanitizeCsvCell`) na exportação.

## Consequências
- **Positivas:** Custo zero de processamento de arquivo binário nas Serverless Functions da Vercel; bundle inicial de `/membros` reduzido pelo `import('xlsx')` dinâmico; validação e persistência transacional centralizadas no servidor.
- **Cuidados de Segurança:** O parser de planilha roda apenas em memória no navegador do próprio gestor autenticado que selecionou o arquivo local, e o servidor nunca processa binários `.xlsx` não confiáveis, recebendo apenas JSON validado por schema Zod.
