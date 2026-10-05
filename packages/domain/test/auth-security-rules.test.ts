import { describe, expect, it } from 'vitest';
import {
  // 1. Força bruta e rate limiting
  InMemoryRateLimiter,
  HybridRateLimiter,
  validatePasswordPolicy,
  hashPassword,
  verifyPassword,
  // 2. Sessão e inatividade
  SESSION_INACTIVITY_TIMEOUT_PRIVILEGED_MS,
  SESSION_INACTIVITY_TIMEOUT_MEMBER_MS,
  SESSION_ABSOLUTE_MAX_AGE_MS,
  generateSessionId,
  isSessionExpiredByMaxAge,
  isSessionExpiredByInactivity,
  evaluateSessionValidity,
  SessionPayload,
  // 3. App / Refresh tokens com detecção de reuso
  ACCESS_TOKEN_LIFETIME_SECONDS,
  REFRESH_TOKEN_LIFETIME_DAYS,
  generateRefreshTokenPair,
  hashRefreshToken,
  isRefreshTokenExpired,
  evaluateRefreshToken,
  RefreshTokenRecord,
  // 4. ActionTokens (expirado / já usado)
  generateActionToken,
  hashActionToken,
  isActionTokenValid,
  isActionTokenExpired,
  // 5. PENDENTE não acessa nada
  can,
  UserContext,
  Action,
} from '../src/index.js';

describe('Segurança: Autenticação e Sessão (Regra 10 & SKILL)', () => {
  // =========================================================================
  // 1. FORÇA BRUTA BLOQUEIA
  // =========================================================================
  describe('1. Força bruta bloqueia (Rate Limiting e Bloqueio de Conta)', () => {
    it('bloqueia tentativas excessivas por IP com rate limiting progressivo', () => {
      const limiter = new InMemoryRateLimiter({
        maxAttempts: 5,
        windowMs: 15 * 60 * 1000,
        blockDurationMs: 15 * 60 * 1000,
      });

      const ip = '189.40.120.55';

      // 4 primeiras tentativas permitidas
      for (let i = 1; i <= 4; i++) {
        const res = limiter.recordAttempt(ip);
        expect(res.blocked).toBe(false);
        expect(res.remainingAttempts).toBe(5 - i);
      }

      // 5ª tentativa: atinge o limite e bloqueia
      const att5 = limiter.recordAttempt(ip);
      expect(att5.blocked).toBe(true);
      expect(att5.remainingAttempts).toBe(0);

      // Tentativas subsequentes continuam bloqueadas
      const att6 = limiter.recordAttempt(ip);
      expect(att6.blocked).toBe(true);

      const status = limiter.isBlocked(ip);
      expect(status.blocked).toBe(true);
      expect(status.remainingMs).toBeGreaterThan(0);

      // Limpeza manual ou expiração restaura acesso
      limiter.reset(ip);
      expect(limiter.isBlocked(ip).blocked).toBe(false);
    });

    it('aplica lógica de bloqueio temporário por conta após 5 falhas consecutivas', () => {
      let failedLogins = 0;
      let lockedUntil: Date | null = null;
      const now = new Date('2026-10-05T12:00:00Z');

      const simulateLoginAttempt = (currentTime: Date, isPasswordCorrect: boolean) => {
        // Se ainda estiver dentro do período de bloqueio, rejeita imediatamente
        if (lockedUntil && lockedUntil.getTime() > currentTime.getTime()) {
          return { success: false, locked: true };
        }

        // Se o bloqueio expirou no tempo, reseta o bloqueio
        if (lockedUntil && lockedUntil.getTime() <= currentTime.getTime()) {
          lockedUntil = null;
          failedLogins = 0;
        }

        if (!isPasswordCorrect) {
          failedLogins++;
          if (failedLogins >= 5) {
            lockedUntil = new Date(currentTime.getTime() + 15 * 60 * 1000);
            return { success: false, locked: true };
          }
          return { success: false, locked: false };
        }

        // Sucesso
        failedLogins = 0;
        lockedUntil = null;
        return { success: true, locked: false };
      };

      // 4 falhas: conta não bloqueada ainda
      for (let i = 0; i < 4; i++) {
        const res = simulateLoginAttempt(now, false);
        expect(res.locked).toBe(false);
      }
      expect(failedLogins).toBe(4);

      // 5ª falha: aciona bloqueio por 15 minutos
      const res5 = simulateLoginAttempt(now, false);
      expect(res5.locked).toBe(true);
      expect(lockedUntil!.getTime()).toBe(now.getTime() + 15 * 60 * 1000);

      // Durante os 15 minutos, tentativas adicionais são bloqueadas mesmo com nova chamada
      const duringLock = simulateLoginAttempt(new Date('2026-10-05T12:10:00Z'), false); // 10 min depois
      expect(duringLock.locked).toBe(true);

      // Após 15 minutos (12:16), o bloqueio expirou e login com senha correta é aceito
      const afterLock = simulateLoginAttempt(new Date('2026-10-05T12:16:00Z'), true);
      expect(afterLock.locked).toBe(false);
      expect(afterLock.success).toBe(true);
      expect(failedLogins).toBe(0);
      expect(lockedUntil).toBeNull();
    });
  });

  // =========================================================================
  // 2. SESSÃO EXPIRA (Expiração Absoluta e por Inatividade)
  // =========================================================================
  describe('2. Sessão expira (Expiração Absoluta e por Inatividade)', () => {
    it('gera sessionId de 256 bits criptográfico aleatório', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).toHaveLength(64); // 32 bytes hex = 256 bits
      expect(id2).toHaveLength(64);
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('expira sessão que excedeu a duração máxima absoluta de 7 dias', () => {
      const now = Date.now();
      const withinLimit = now - 6 * 24 * 60 * 60 * 1000; // 6 dias atrás
      const exceededLimit = now - 8 * 24 * 60 * 60 * 1000; // 8 dias atrás

      expect(isSessionExpiredByMaxAge(withinLimit, now)).toBe(false);
      expect(isSessionExpiredByMaxAge(exceededLimit, now)).toBe(true);
    });

    it('expira sessão de perfis privilegiados (ADMIN_MASTER, PASTOR, ELDER, GESTOR) após 30 min de inatividade', () => {
      const now = Date.now();
      const active20MinAgo = now - 20 * 60 * 1000;
      const inactive35MinAgo = now - 35 * 60 * 1000;

      // ADMIN_MASTER
      expect(
        isSessionExpiredByInactivity({ globalRole: 'ADMIN_MASTER', lastActiveAt: active20MinAgo }, now)
      ).toBe(false);
      expect(
        isSessionExpiredByInactivity({ globalRole: 'ADMIN_MASTER', lastActiveAt: inactive35MinAgo }, now)
      ).toBe(true);

      // PASTOR
      expect(
        isSessionExpiredByInactivity({ globalRole: 'PASTOR', lastActiveAt: inactive35MinAgo }, now)
      ).toBe(true);

      // ELDER
      expect(
        isSessionExpiredByInactivity({ globalRole: 'ELDER', lastActiveAt: inactive35MinAgo }, now)
      ).toBe(true);

      // GESTOR (USER com isManager = true)
      expect(
        isSessionExpiredByInactivity(
          { globalRole: 'USER', isManager: true, lastActiveAt: inactive35MinAgo },
          now
        )
      ).toBe(true);
    });

    it('permite inatividade mais longa (24 horas) para membros voluntários comuns', () => {
      const now = Date.now();
      const inactive2HoursAgo = now - 2 * 60 * 60 * 1000;
      const inactive25HoursAgo = now - 25 * 60 * 60 * 1000;

      // Voluntário ativo há 2 horas continua com sessão válida
      expect(
        isSessionExpiredByInactivity(
          { globalRole: 'USER', isManager: false, lastActiveAt: inactive2HoursAgo },
          now
        )
      ).toBe(false);

      // Voluntário inativo há 25 horas expira
      expect(
        isSessionExpiredByInactivity(
          { globalRole: 'USER', isManager: false, lastActiveAt: inactive25HoursAgo },
          now
        )
      ).toBe(true);
    });

    it('avalia integridade global de sessão com evaluateSessionValidity', () => {
      const now = Date.now();
      const validPayload: SessionPayload = {
        sessionId: generateSessionId(),
        userId: 'usr_valid_1',
        globalRole: 'USER',
        status: 'ACTIVE',
        name: 'Maria Oliveira',
        email: 'maria@revezo.com',
        createdAt: now - 3600 * 1000,
        lastActiveAt: now - 600 * 1000,
      };

      // Sessão perfeitamente ativa
      const validRes = evaluateSessionValidity(validPayload, now);
      expect(validRes.valid).toBe(true);
      expect(validRes.reason).toBe('VALID');

      // Sessão com inatividade excedida
      const inactivePayload: SessionPayload = {
        ...validPayload,
        globalRole: 'ADMIN_MASTER',
        lastActiveAt: now - 40 * 60 * 1000, // 40 min atrás
      };
      const inactiveRes = evaluateSessionValidity(inactivePayload, now);
      expect(inactiveRes.valid).toBe(false);
      expect(inactiveRes.reason).toBe('EXPIRED_INACTIVITY');

      // Sessão com idade absoluta excedida (8 dias)
      const oldPayload: SessionPayload = {
        ...validPayload,
        createdAt: now - 8 * 24 * 60 * 60 * 1000,
      };
      const oldRes = evaluateSessionValidity(oldPayload, now);
      expect(oldRes.valid).toBe(false);
      expect(oldRes.reason).toBe('EXPIRED_ABSOLUTE');
    });
  });

  // =========================================================================
  // 3. REFRESH REUTILIZADO É REVOGADO (Detecção de Reuso e Revogação da Família)
  // =========================================================================
  describe('3. Refresh reutilizado é revogado (Detecção de Reuso da Família)', () => {
    it('gera refresh tokens de 32 bytes hex com hash SHA-256 e familyId consistente', () => {
      const pair = generateRefreshTokenPair();

      expect(pair.rawRefreshToken).toHaveLength(64); // 32 bytes hex
      expect(pair.tokenHash).toHaveLength(64); // SHA-256 hex
      expect(pair.familyId).toBeDefined();
      expect(hashRefreshToken(pair.rawRefreshToken)).toBe(pair.tokenHash);
    });

    it('aprova rotação normal de um token ativo e não expirado', () => {
      const now = new Date('2026-10-05T12:00:00Z');
      const tokenRecord: RefreshTokenRecord = {
        id: 'tok_1',
        userId: 'usr_mobile_1',
        familyId: 'family_123',
        tokenHash: 'hash_abc',
        expiresAt: new Date('2026-11-04T12:00:00Z'), // 30 dias depois
        revokedAt: null,
        createdAt: new Date('2026-10-05T12:00:00Z'),
      };

      const result = evaluateRefreshToken(tokenRecord, now);
      expect(result.valid).toBe(true);
      expect(result.reuseDetected).toBe(false);
      expect(result.reason).toBe('VALID');
    });

    it('rejeita token expirado sem sinalizar reuso malicioso', () => {
      const now = new Date('2026-11-10T12:00:00Z');
      const tokenRecord: RefreshTokenRecord = {
        id: 'tok_expired',
        userId: 'usr_mobile_1',
        familyId: 'family_123',
        tokenHash: 'hash_expired',
        expiresAt: new Date('2026-11-04T12:00:00Z'), // já passou
        revokedAt: null,
        createdAt: new Date('2026-10-05T12:00:00Z'),
      };

      const result = evaluateRefreshToken(tokenRecord, now);
      expect(result.valid).toBe(false);
      expect(result.reuseDetected).toBe(false);
      expect(result.reason).toBe('EXPIRED');
    });

    it('DETECTA REUSO ao apresentar um token que já foi revogado e exige revogação da família inteira', () => {
      const now = new Date('2026-10-05T12:30:00Z');

      // Simulação do cenário de ataque:
      // O cliente legítimo rotacionou tok_1 para tok_2 às 12:15 (tok_1 marcado como revogado).
      // Um atacante que interceptou tok_1 tenta usá-lo às 12:30.
      const reusedToken: RefreshTokenRecord = {
        id: 'tok_1_compromised',
        userId: 'usr_mobile_1',
        familyId: 'family_123',
        tokenHash: 'hash_tok_1',
        expiresAt: new Date('2026-11-04T12:00:00Z'),
        revokedAt: new Date('2026-10-05T12:15:00Z'), // Foi revogado na rotação anterior!
        createdAt: new Date('2026-10-05T12:00:00Z'),
      };

      const evaluation = evaluateRefreshToken(reusedToken, now);

      // O domínio detecta estritamente o reuso
      expect(evaluation.valid).toBe(false);
      expect(evaluation.reuseDetected).toBe(true);
      expect(evaluation.reason).toBe('REUSE_DETECTED');

      // Na camada de banco, toda a família 'family_123' é sumariamente revogada
      const simulatedTokenFamily = [
        { id: 'tok_1_compromised', familyId: 'family_123', revokedAt: new Date('2026-10-05T12:15:00Z') },
        { id: 'tok_2_legitimate', familyId: 'family_123', revokedAt: null }, // ainda estava ativo
      ];

      if (evaluation.reuseDetected) {
        // Revogação de segurança de todos os membros da família
        simulatedTokenFamily.forEach((t) => {
          if (!t.revokedAt) t.revokedAt = now;
        });
      }

      // Agora até mesmo o token legítimo mais recente (tok_2) passa a ser revogado
      const tok2 = simulatedTokenFamily.find((t) => t.id === 'tok_2_legitimate')!;
      expect(tok2.revokedAt).toEqual(now);
    });
  });

  // =========================================================================
  // 4. TOKEN EXPIRADO OU USADO FALHA (ActionToken)
  // =========================================================================
  describe('4. Token expirado ou usado falha (ActionToken de recuperação e confirmação)', () => {
    it('valida token de recuperação de senha não consumido e dentro do prazo de 30 min', () => {
      const now = new Date('2026-10-05T12:10:00Z');
      const expiresAt = new Date('2026-10-05T12:30:00Z'); // 30 min a partir das 12:00

      const check = isActionTokenValid({ usedAt: null, expiresAt }, now);
      expect(check.valid).toBe(true);
      expect(check.reason).toBeUndefined();
    });

    it('rejeita token de uso único que já foi consumido anteriormente', () => {
      const now = new Date('2026-10-05T12:15:00Z');
      const expiresAt = new Date('2026-10-05T12:30:00Z');
      const usedAt = new Date('2026-10-05T12:10:00Z'); // Já utilizado

      const check = isActionTokenValid({ usedAt, expiresAt }, now);
      expect(check.valid).toBe(false);
      expect(check.reason).toBe('ALREADY_USED');
    });

    it('rejeita token de recuperação de senha após os 30 minutos de expiração', () => {
      const now = new Date('2026-10-05T12:35:00Z'); // 35 min depois
      const expiresAt = new Date('2026-10-05T12:30:00Z');

      const check = isActionTokenValid({ usedAt: null, expiresAt }, now);
      expect(check.valid).toBe(false);
      expect(check.reason).toBe('EXPIRED');
    });

    it('garante que a rotação e consumo em transação é de uso único estrito', () => {
      let tokenInDb = {
        tokenHash: 'hash_secret_token_123',
        usedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 1800 * 1000),
      };

      const consumeToken = () => {
        const check = isActionTokenValid(tokenInDb);
        if (!check.valid) {
          throw new Error(`Token inválido: ${check.reason}`);
        }
        tokenInDb.usedAt = new Date();
        return true;
      };

      // 1º consumo: sucesso
      expect(consumeToken()).toBe(true);
      expect(tokenInDb.usedAt).not.toBeNull();

      // 2º consumo imediato com o mesmo token: falha com ALREADY_USED
      expect(() => consumeToken()).toThrow('Token inválido: ALREADY_USED');
    });
  });

  // =========================================================================
  // 5. PENDENTE NÃO ACESSA NADA
  // =========================================================================
  describe('5. PENDENTE não acessa nada (Isolamento Absoluto de Voluntários Não Aprovados)', () => {
    const pendingUser: UserContext = {
      id: 'usr_pending_1',
      globalRole: 'USER',
      status: 'PENDING',
      departmentMemberships: [],
    };

    it('nega todas as ações protegidas do sistema quando status for PENDING', () => {
      const actionsToTest: Action[] = [
        'profile:view:own',
        'profile:update:own',
        'profile:view:other',
        'profile:export:own',
        'registration:approve',
        'member:create',
        'department:view',
        'program:view',
        'program:create',
        'assignment:view:own',
        'assignment:view:all',
        'assignment:confirm:own',
        'assignment:decline:own',
        'availability:manage:own',
        'church:settings:update',
        'audit:view',
      ];

      for (const action of actionsToTest) {
        const permitted = can(pendingUser, action);
        expect(permitted).toBe(false);
      }
    });

    it('invalida qualquer tentativa de sessão web com status PENDING', () => {
      const sessionWithPendingStatus: SessionPayload = {
        sessionId: generateSessionId(),
        userId: 'usr_pending_2',
        globalRole: 'USER',
        status: 'PENDING',
        name: 'Candidato Pendente',
        email: 'candidato@igreja.org',
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      const result = evaluateSessionValidity(sessionWithPendingStatus);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ACCOUNT_NOT_ACTIVE');
    });

    it('nega acesso mesmo se o usuário tiver status REJECTED ou INACTIVE', () => {
      const rejectedUser: UserContext = {
        id: 'usr_rejected',
        globalRole: 'USER',
        status: 'REJECTED',
        departmentMemberships: [],
      };

      const inactiveUser: UserContext = {
        id: 'usr_inactive',
        globalRole: 'USER',
        status: 'INACTIVE',
        departmentMemberships: [],
      };

      expect(can(rejectedUser, 'profile:view:own')).toBe(false);
      expect(can(inactiveUser, 'profile:view:own')).toBe(false);
    });
  });
});
