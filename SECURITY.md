# Política de Segurança — Revezo

A segurança da informação e a privacidade dos dados dos membros e voluntários das igrejas são prioridades fundamentais no projeto **Revezo**. Levamos a sério qualquer relato de vulnerabilidade e nos comprometemos com uma resolução rápida e responsável.

---

## Versões com Suporte

| Versão | Suporte de Segurança |
|---|---|
| Branch `main` | ✅ Totalmente suportada |
| Última versão estável publicada | ✅ Totalmente suportada |
| Versões anteriores | ❌ Não suportadas (atualize para a versão mais recente) |

---

## Como Reportar uma Vulnerabilidade

> [!CAUTION]
> **NÃO abra uma issue pública** no GitHub para relatar vulnerabilidades de segurança ou riscos de vazamento de dados. Relatos públicos expõem voluntários e igrejas que utilizam a aplicação antes de uma correção estar disponível.

### Canal Preferencial: GitHub Private Vulnerability Reporting

Recomendamos utilizar o recurso de reporte privado de segurança do GitHub:
1. Acesse a aba **[Security](https://github.com/Helismey/escala-igreja/security)** do repositório.
2. Clique em **Report a vulnerability** (Advisories).
3. Descreva os detalhes da vulnerabilidade encontrada.

Caso a opção de Security Advisories esteja indisponível, entre em contato diretamente com os mantenedores do projeto através do perfil do GitHub ou pelos contatos institucionais do repositório.

### O que Incluir no Reporte

Para acelerar a análise e correção, inclua no seu relato:
- Descrição clara da vulnerabilidade e seu impacto em potencial.
- Passos reproduzíveis ou Prova de Conceito (PoC) simples.
- Componente, módulo ou rota afetada.
- Informações sobre versão, ambiente ou configurações específicas necessárias para reprodução.

---

## Nossos Prazos e Níveis de Resposta

Seguimos a matriz de resposta a incidentes do projeto:

| Nível | Descrição | Resposta Inicial |
|---|---|---|
| **P1 — Crítica** | Vazamento ativo de dados pessoais (LGPD), bypass de autenticação ou escalonamento para administrador | Até 1 hora |
| **P2 — Alta** | Comprometimento confirmado em ambiente isolado ou falha grave de autorização de departamento | Até 4 horas |
| **P3 — Média** | Vulnerabilidade de risco moderado, dependência desatualizada com exploit conhecido | Até 24 horas |
| **P4 — Baixa** | Questões de configuração menor ou boas práticas que não expõem dados diretamente | Até 72 horas |

---

## Divulgação Responsável (Coordinated Disclosure)

Pedimos que você nos conceda um prazo razoável para investigar e lançar uma correção antes de qualquer divulgação pública.
Comprometemo-nos a:
1. Confirmar o recebimento do seu reporte no prazo de resposta aplicável.
2. Manter você informado sobre o progresso da correção.
3. Dar o devido crédito pelo reporte após a publicação da correção (a menos que prefira manter o anonimato).

---

## Diretrizes de Proteção de Dados (LGPD)

O Revezo adota medidas rigorosas para proteger a privacidade dos membros:
- Criptografia de dados sensíveis em repouso e em trânsito.
- Controle de acesso granular por congregação e departamento (RBAC).
- Trilha de auditoria em ações críticas (`AuditLog`).
- Ausência de rastreadores invasivos de terceiros.
