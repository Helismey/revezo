// Scheduling & Motor de Escala
export * from './scheduling/conflict.js';
export * from './scheduling/daily-limit.js';
export * from './scheduling/eligibility.js';
export * from './scheduling/availability.js';
export * from './scheduling/ranking.js';
export * from './scheduling/cloning.js';
export * from './scheduling/auto-substitution.js';
export * from './scheduling/auto-scheduler.js';
export * from './scheduling/overload-detector.js';
export * from './scheduling/swap-rules.js';
export * from './scheduling/recurrence.js';

// RBAC & Autorização
export * from './authz/can.js';
export * from './authz/sanitization.js';

// Criptografia
export * from './crypto/aes.js';

// Autenticação & Segurança
export * from './auth/password.js';
export * from './auth/rate-limiter.js';
export * from './auth/totp.js';
export * from './auth/action-token.js';

// Navegação & Menus
export * from './navigation/menu.js';

// Tema & Acessibilidade
export * from './theme/contrast.js';

// Membro, Perfil & LGPD
export * from './member/profile.js';

// Notificações & Lembretes
export * from './notifications/reminder-calculator.js';
export * from './notifications/message-templates.js';
export * from './notifications/webhook-security.js';

// Calendário (.ics)
export * from './calendar/ics-generator.js';

