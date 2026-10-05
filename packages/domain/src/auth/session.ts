import { randomBytes } from 'crypto';
import { GlobalRole, AccountStatus } from '../authz/can.js';

/**
 * Regra 10: Autenticação e Sessão
 * - Admin, Pastor, Ancião e Gestor: inatividade máxima de 30 minutos.
 * - Membro/Voluntário comum: inatividade de até 24 horas.
 * - Duração máxima absoluta de qualquer sessão web: 7 dias.
 */
export const SESSION_INACTIVITY_TIMEOUT_PRIVILEGED_MS = 30 * 60 * 1000; // 30 minutos
export const SESSION_INACTIVITY_TIMEOUT_MEMBER_MS = 24 * 60 * 60 * 1000; // 24 horas
export const SESSION_ABSOLUTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export interface SessionPayload {
  sessionId: string; // ID aleatório de 256 bits (Regra 10)
  userId: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  name: string;
  email: string;
  mfaEnabled?: boolean;
  isManager?: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: 'VALID' | 'EXPIRED_ABSOLUTE' | 'EXPIRED_INACTIVITY' | 'ACCOUNT_NOT_ACTIVE' | 'MALFORMED';
}

/**
 * Gera identificador aleatório de 256 bits (32 bytes em hexadecimal) para a sessão.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Determina se a sessão ultrapassou a duração máxima absoluta (7 dias).
 */
export function isSessionExpiredByMaxAge(
  createdAt: number,
  now: number = Date.now(),
  maxAgeMs: number = SESSION_ABSOLUTE_MAX_AGE_MS
): boolean {
  return now - createdAt > maxAgeMs;
}

/**
 * Determina se a sessão ultrapassou o tempo limite de inatividade baseado no perfil.
 * Administradores, Pastores, Anciãos e Gestores expiram em 30 min.
 * Voluntários comuns expiram em 24h.
 */
export function isSessionExpiredByInactivity(
  session: Pick<SessionPayload, 'globalRole' | 'lastActiveAt' | 'isManager'>,
  now: number = Date.now(),
  customInactivityMs?: number
): boolean {
  if (customInactivityMs !== undefined) {
    return now - session.lastActiveAt > customInactivityMs;
  }

  const isPrivileged =
    session.globalRole === 'ADMIN_MASTER' ||
    session.globalRole === 'PASTOR' ||
    session.globalRole === 'ELDER' ||
    Boolean(session.isManager);

  const timeoutMs = isPrivileged
    ? SESSION_INACTIVITY_TIMEOUT_PRIVILEGED_MS
    : SESSION_INACTIVITY_TIMEOUT_MEMBER_MS;

  return now - session.lastActiveAt > timeoutMs;
}

/**
 * Avalia integralmente o estado de uma sessão contra a Regra 10 e regra de status PENDENTE.
 */
export function evaluateSessionValidity(
  session: SessionPayload,
  now: number = Date.now()
): SessionValidationResult {
  if (!session || !session.sessionId || !session.userId || !session.status) {
    return { valid: false, reason: 'MALFORMED' };
  }

  // 1. Contas PENDENTES, REJEITADAS ou INATIVAS não têm sessão válida (Regra 10)
  if (session.status !== 'ACTIVE') {
    return { valid: false, reason: 'ACCOUNT_NOT_ACTIVE' };
  }

  // 2. Expiração absoluta máxima
  if (isSessionExpiredByMaxAge(session.createdAt, now)) {
    return { valid: false, reason: 'EXPIRED_ABSOLUTE' };
  }

  // 3. Expiração por inatividade
  if (isSessionExpiredByInactivity(session, now)) {
    return { valid: false, reason: 'EXPIRED_INACTIVITY' };
  }

  return { valid: true, reason: 'VALID' };
}
