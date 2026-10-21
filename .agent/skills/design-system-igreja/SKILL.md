---
name: design-system-igreja
description: "Use ao criar componentes, telas ou tema visual: tokens, cores e logo configuráveis, estados, acessibilidade."
---

# Design system da igreja

## Tokens (CSS variables, em `apps/web/src/styles/tokens.css`)
- Cor: `--color-primary`, `--color-secondary`, `--color-surface`, `--color-text`, semânticas (`--color-success`, `--color-warning`, `--color-danger`). Primária e secundária vêm de `ChurchSettings` e são aplicadas em runtime.
- Tipografia: escala 12/14/16/20/24/32; fonte do sistema para desempenho.
- Espaçamento: escala de 4px. Raio: 8px padrão. Sombras em 2 níveis. Movimento: 150 a 200ms.
- Validar automaticamente contraste AA de qualquer cor escolhida pela igreja; avisar e sugerir ajuste.

## Componentes base
Button, Input, Select, Checkbox, Avatar, Badge de status (Pendente, Confirmado, Aberto, Recusado), Card de escala, Calendário, Tabela responsiva, Modal de confirmação, Toast, Empty state.
Cada um com variantes, estados (padrão, hover, foco, ativo, desabilitado, carregando, erro), tamanhos e notas de acessibilidade em `docs/design-system.md`.

## Princípios
Consistência antes de criatividade; documentar ao construir; nunca hardcodar cor, espaçamento ou fonte; mobile first.
