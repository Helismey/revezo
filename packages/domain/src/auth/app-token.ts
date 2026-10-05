import { createHash, randomBytes, randomUUID } from 'crypto';

/**
 * Regra 10: Tokens (app mobile / Capacitor)
 * - Access token curto: 15 minutos (900 segundos).
 * - Refresh token: 30 dias, rotação contínua e detecção de reuso.
 * - Reuso detectado = revogação imediata de toda a família de tokens.
 */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60; // 15 minutos (Regra 10)
export const REFRESH_TOKEN_LIFETIME_DAYS = 30; // 30 dias

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  deviceName?: string | null;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface RefreshTokenPair {
  rawRefreshToken: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenValidationResult {
  valid: boolean;
  reuseDetected: boolean;
  reason?: 'VALID' | 'EXPIRED' | 'REUSE_DETECTED' | 'NOT_FOUND';
}

/**
 * Gera um novo par de refresh token aleatório (32 bytes = 256 bits criptográficos)
 * com seu respectivo hash SHA-256 e família de rotação.
 */
export function generateRefreshTokenPair(
  familyId: string = randomUUID(),
  lifetimeDays: number = REFRESH_TOKEN_LIFETIME_DAYS
): RefreshTokenPair {
  const rawRefreshToken = randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + lifetimeDays * 24 * 60 * 60 * 1000);

  return {
    rawRefreshToken,
    tokenHash,
    familyId,
    expiresAt,
  };
}

/**
 * Calcula o hash SHA-256 de um refresh token em texto simples.
 * Apenas o hash é persistido no banco de dados (Regra 10).
 */
export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Verifica se um refresh token está expirado.
 */
export function isRefreshTokenExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return now.getTime() > expiry.getTime();
}

/**
 * Avalia o status de um refresh token e detecta potenciais reusos de tokens já revogados.
 */
export function evaluateRefreshToken(
  token: RefreshTokenRecord | null | undefined,
  now: Date = new Date()
): RefreshTokenValidationResult {
  if (!token) {
    return { valid: false, reuseDetected: false, reason: 'NOT_FOUND' };
  }

  // Se o token já possui data de revogação, trata-se de tentativa de REUSO (roubo ou replay)
  if (token.revokedAt) {
    return { valid: false, reuseDetected: true, reason: 'REUSE_DETECTED' };
  }

  // Verifica expiração
  if (isRefreshTokenExpired(token.expiresAt, now)) {
    return { valid: false, reuseDetected: false, reason: 'EXPIRED' };
  }

  return { valid: true, reuseDetected: false, reason: 'VALID' };
}
