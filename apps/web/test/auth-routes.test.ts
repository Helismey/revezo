import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as handleTokenPost } from '../src/app/api/auth/token/route';
import { POST as handleRefreshPost } from '../src/app/api/auth/refresh/route';
import * as authService from '../src/lib/auth-service';
import * as dbTransactions from '@revezo/db';

vi.mock('@revezo/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    departmentMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  createAppSessionTokens: vi.fn(),
  rotateAppRefreshToken: vi.fn(),
}));

describe('Auth Mobile API Endpoints (/api/auth/token & /api/auth/refresh)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/token', () => {
    it('emite access token de 15 min e refresh token rotacionável para credenciais válidas', async () => {
      const mockUser = {
        id: 'usr_valid_app',
        name: 'Carlos Oliveira',
        email: 'carlos@escala.org',
        globalRole: 'USER',
        status: 'ACTIVE',
        mfaEnabled: false,
        memberships: [],
      };

      vi.spyOn(authService, 'authenticateUser').mockResolvedValue({
        success: true,
        token: 'signed_cookie_token',
        user: mockUser as any,
      });

      vi.mocked(dbTransactions.createAppSessionTokens).mockResolvedValue({
        rawRefreshToken: 'raw_refresh_token_64_bytes_hex_random_1234567890abcdef',
        familyId: 'family_uuid_123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        user: mockUser as any,
      });

      const req = new Request('https://revezo.com.br/api/auth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'carlos@escala.org',
          password: 'MinhaSenhaSegura123!',
          deviceName: 'Samsung Galaxy S24 (Android)',
        }),
      });

      const res = await handleTokenPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tokenType).toBe('Bearer');
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBe('raw_refresh_token_64_bytes_hex_random_1234567890abcdef');
      expect(data.expiresIn).toBe(900); // 15 minutos (Regra 10)
      expect(data.user.name).toBe('Carlos Oliveira');
    });

    it('retorna 401 quando authenticateUser falha (senha incorreta ou rate limit)', async () => {
      vi.spyOn(authService, 'authenticateUser').mockResolvedValue({
        success: false,
        error: 'E-mail ou senha incorretos.',
      });

      const req = new Request('https://revezo.com.br/api/auth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'carlos@escala.org',
          password: 'SenhaErrada1234!',
        }),
      });

      const res = await handleTokenPost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('E-mail ou senha incorretos.');
    });

    it('rejeita dados de login malformatados com status 400', async () => {
      const req = new Request('https://revezo.com.br/api/auth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'email-invalido',
          password: 'curta',
        }),
      });

      const res = await handleTokenPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('renova a sessão do app rotacionando o refresh token e emitindo novo access token de 15 min', async () => {
      const mockUser = {
        id: 'usr_valid_app',
        name: 'Carlos Oliveira',
        email: 'carlos@escala.org',
        globalRole: 'USER',
        status: 'ACTIVE',
        mfaEnabled: false,
      };

      vi.mocked(dbTransactions.rotateAppRefreshToken).mockResolvedValue({
        rawRefreshToken: 'new_rotated_refresh_token_7890abcdef',
        familyId: 'family_uuid_123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        user: mockUser as any,
      });

      const req = new Request('https://revezo.com.br/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'old_active_refresh_token_1234567890abcdef',
          deviceName: 'Samsung Galaxy S24',
        }),
      });

      const res = await handleRefreshPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tokenType).toBe('Bearer');
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBe('new_rotated_refresh_token_7890abcdef');
      expect(data.expiresIn).toBe(900); // 15 minutos
    });

    it('retorna 403 e mensagem de segurança quando REUSO DE TOKEN é detectado', async () => {
      vi.mocked(dbTransactions.rotateAppRefreshToken).mockRejectedValue(
        new Error('Reuso de token detectado. Todas as sessões deste dispositivo foram revogadas por segurança.')
      );

      const req = new Request('https://revezo.com.br/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'replayed_compromised_token_1234567890abcdef',
        }),
      });

      const res = await handleRefreshPost(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Reuso de token detectado');
    });

    it('retorna 401 quando o token está expirado ou não encontrado', async () => {
      vi.mocked(dbTransactions.rotateAppRefreshToken).mockRejectedValue(
        new Error('Sessão expirada. Faça login novamente.')
      );

      const req = new Request('https://revezo.com.br/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          refreshToken: 'token_expirado_1234567890abcdef_32chars',
        }),
      });

      const res = await handleRefreshPost(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Sessão expirada');
    });
  });
});
