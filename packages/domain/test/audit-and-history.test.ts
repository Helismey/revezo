import { describe, it, expect, vi } from 'vitest';
import { can, type UserAuthContext } from '../src/authz/can.js';
import {
  maskPhoneForAudit,
  maskEmailForAudit,
  sanitizeAuditMeta,
} from '../../db/src/audit.js';
import { prisma } from '../../db/src/client.js';

describe('Auditoria e Histórico — Regras de Negócio e Segurança (Regra 19 e Skill)', () => {
  describe('1. Garantia de Imutabilidade (AuditLog Somente-Inserção)', () => {
    it('bloqueia estritamente qualquer tentativa de update em AuditLog', async () => {
      await expect(
        prisma.auditLog.update({
          where: { id: 'audit-1' },
          data: { action: 'MODIFIED_ACTION' },
        } as any)
      ).rejects.toThrow(/AuditLog é somente-inserção \(Regra 19\)/);
    });

    it('bloqueia estritamente qualquer tentativa de updateMany em AuditLog', async () => {
      await expect(
        prisma.auditLog.updateMany({
          where: { result: 'DENIED' },
          data: { result: 'SUCCESS' },
        } as any)
      ).rejects.toThrow(/AuditLog é somente-inserção \(Regra 19\)/);
    });

    it('bloqueia estritamente qualquer tentativa de delete em AuditLog', async () => {
      await expect(
        prisma.auditLog.delete({
          where: { id: 'audit-1' },
        } as any)
      ).rejects.toThrow(/AuditLog é somente-inserção \(Regra 19\)/);
    });

    it('bloqueia estritamente qualquer tentativa de deleteMany em AuditLog', async () => {
      await expect(
        prisma.auditLog.deleteMany({
          where: { action: 'LOGIN_FAILED' },
        } as any)
      ).rejects.toThrow(/AuditLog é somente-inserção \(Regra 19\)/);
    });

    it('bloqueia estritamente qualquer tentativa de upsert em AuditLog', async () => {
      await expect(
        prisma.auditLog.upsert({
          where: { id: 'audit-1' },
          create: { action: 'TEST', result: 'SUCCESS' },
          update: { action: 'TEST2' },
        } as any)
      ).rejects.toThrow(/AuditLog é somente-inserção \(Regra 19\)/);
    });
  });

  describe('2. Higienização e Mascaramento de Dados nos Metadados (LGPD e Regra 19)', () => {
    it('mascara telefones celulares brasileiros corretamente', () => {
      expect(maskPhoneForAudit('+55 62 99999-1234')).toBe('+5562****1234');
      expect(maskPhoneForAudit('11988887777')).toBe('+1198****7777');
      expect(maskPhoneForAudit('123')).toBe('****');
    });

    it('mascara endereços de e-mail preservando apenas o domínio e primeira letra', () => {
      expect(maskEmailForAudit('usuario@exemplo.com.br')).toBe('u****@exemplo.com.br');
      expect(maskEmailForAudit('joao.silva@igreja.org')).toBe('j****@igreja.org');
      expect(maskEmailForAudit('invalido')).toBe('****');
    });

    it('redige senhas, tokens, cookies e segredos em metadados', () => {
      const sensitiveMeta = {
        userId: 'usr-1',
        password: 'super-secret-password-123',
        token: 'eyJh...jwtToken',
        sessionToken: 'cookie-abc',
        refreshToken: 'rt-xyz',
        encryptionKey: '0123456789abcdef0123456789abcdef',
        normalField: 'Culto de Celebração',
      };

      const sanitized = sanitizeAuditMeta(sensitiveMeta);

      expect(sanitized.userId).toBe('usr-1');
      expect(sanitized.normalField).toBe('Culto de Celebração');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.sessionToken).toBe('[REDACTED]');
      expect(sanitized.refreshToken).toBe('[REDACTED]');
      expect(sanitized.encryptionKey).toBe('[REDACTED]');
    });

    it('mascara campos de contato (telefone e email) recursivamente dentro de objetos e arrays', () => {
      const complexMeta = {
        actorEmail: 'pastor@revezo.com.br',
        volunteerPhone: '+55 11 98765-4321',
        nested: {
          contactEmail: 'membro@revezo.com.br',
          whatsapp: '+55 62 99123-4567',
        },
        recipients: [
          { email: 'voluntario1@revezo.com.br', phone: '11999991111' },
          { email: 'voluntario2@revezo.com.br', phone: '11999992222' },
        ],
      };

      const sanitized = sanitizeAuditMeta(complexMeta);

      expect(sanitized.actorEmail).toBe('p****@revezo.com.br');
      expect(sanitized.volunteerPhone).toBe('+5511****4321');
      expect(sanitized.nested.contactEmail).toBe('m****@revezo.com.br');
      expect(sanitized.nested.whatsapp).toBe('+5562****4567');
      expect(sanitized.recipients[0].email).toBe('v****@revezo.com.br');
      expect(sanitized.recipients[0].phone).toBe('+1199****1111');
      expect(sanitized.recipients[1].email).toBe('v****@revezo.com.br');
      expect(sanitized.recipients[1].phone).toBe('+1199****2222');
    });
  });

  describe('3. Controle de Acesso Estrito à Trilha de Auditoria (Somente ADMIN_MASTER)', () => {
    const adminMaster: UserAuthContext = {
      userId: 'usr-admin',
      globalRole: 'ADMIN_MASTER',
      status: 'ACTIVE',
      churchId: 'church-sede',
      departmentMemberships: [],
    };

    const pastor: UserAuthContext = {
      userId: 'usr-pastor',
      globalRole: 'PASTOR',
      status: 'ACTIVE',
      churchId: 'church-sede',
      pastorChurchIds: ['church-sede'],
      departmentMemberships: [],
    };

    const anciao: UserAuthContext = {
      userId: 'usr-anciao',
      globalRole: 'ELDER',
      status: 'ACTIVE',
      churchId: 'church-sede',
      departmentMemberships: [],
    };

    const gestorDepto: UserAuthContext = {
      userId: 'usr-gestor',
      globalRole: 'VOLUNTEER',
      status: 'ACTIVE',
      churchId: 'church-sede',
      departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
    };

    const voluntario: UserAuthContext = {
      userId: 'usr-voluntario',
      globalRole: 'VOLUNTEER',
      status: 'ACTIVE',
      churchId: 'church-sede',
      departmentMemberships: [{ departmentId: 'dept-louvor', role: 'VOLUNTEER' }],
    };

    it('permite que apenas ADMIN_MASTER veja a trilha de auditoria (audit:view)', () => {
      expect(can(adminMaster, 'audit:view')).toBe(true);
      expect(can(pastor, 'audit:view')).toBe(false);
      expect(can(anciao, 'audit:view')).toBe(false);
      expect(can(gestorDepto, 'audit:view')).toBe(false);
      expect(can(voluntario, 'audit:view')).toBe(false);
    });

    it('impede que gestores ou pastores acessem auditoria geral do sistema', () => {
      expect(can(pastor, 'audit:view', { churchId: 'church-sede' })).toBe(false);
      expect(can(gestorDepto, 'audit:view', { departmentId: 'dept-louvor' })).toBe(false);
    });
  });
});
