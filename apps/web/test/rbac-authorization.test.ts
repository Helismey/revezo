import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  can,
  UserContext,
  buildAssignmentScopeWhere,
  buildDepartmentScopeWhere,
  buildMemberScopeWhere,
  extractUserScope,
} from '@revezo/domain';
import { prisma, adminUpdateMemberWithAudit } from '@revezo/db';

const mockTx = {
  user: {
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  departmentMember: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  assignment: {
    findMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    update: vi.fn(),
  },
  programSlot: {
    update: vi.fn(),
  },
};

describe('Segurança: Autorização RBAC, Regra 11 e Prevenção de IDOR', () => {
  const adminMaster: UserContext = {
    id: 'user-admin',
    globalRole: 'ADMIN_MASTER',
    status: 'ACTIVE',
    departmentMemberships: [],
  };

  const pastor: UserContext = {
    id: 'user-pastor',
    globalRole: 'PASTOR',
    status: 'ACTIVE',
    pastorChurchIds: ['igreja-1', 'igreja-2'],
    departmentMemberships: [],
  };

  const elder: UserContext = {
    id: 'user-elder',
    globalRole: 'ELDER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [],
  };

  const gestorA: UserContext = {
    id: 'user-gestor-a',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
  };

  const gestorB: UserContext = {
    id: 'user-gestor-b',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-midia', role: 'MANAGER' }],
  };

  const membroVoluntario: UserContext = {
    id: 'user-membro',
    globalRole: 'USER',
    status: 'ACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MEMBER' }],
  };

  const usuarioPendente: UserContext = {
    id: 'user-pendente',
    globalRole: 'USER',
    status: 'PENDING',
    churchId: 'igreja-1',
    departmentMemberships: [],
  };

  const usuarioInativo: UserContext = {
    id: 'user-inativo',
    globalRole: 'USER',
    status: 'INACTIVE',
    churchId: 'igreja-1',
    departmentMemberships: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));
  });

  describe('1. Contas PENDENTES e INATIVAS (Negar tudo)', () => {
    it('bloqueia todas as ações para usuário pendente', () => {
      expect(can(usuarioPendente, 'profile:view:own', { targetUserId: usuarioPendente.id })).toBe(false);
      expect(can(usuarioPendente, 'assignment:view:own', { targetUserId: usuarioPendente.id })).toBe(false);
      expect(can(usuarioPendente, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(false);
      expect(can(usuarioPendente, 'member:list')).toBe(false);
    });

    it('bloqueia todas as ações para usuário inativo', () => {
      expect(can(usuarioInativo, 'profile:view:own', { targetUserId: usuarioInativo.id })).toBe(false);
      expect(can(usuarioInativo, 'assignment:confirm:own', { targetUserId: usuarioInativo.id })).toBe(false);
      expect(can(usuarioInativo, 'department:view')).toBe(false);
    });
  });

  describe('2. Gestor A vs Departamento B (Isolamento Departamental Anti-IDOR)', () => {
    it('gestor A pode gerenciar dept-louvor, mas NUNCA dept-midia', () => {
      // Dept A (Louvor)
      expect(can(gestorA, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(true);
      expect(can(gestorA, 'assignment:delete', { departmentId: 'dept-louvor' })).toBe(true);
      expect(can(gestorA, 'department:member:add', { departmentId: 'dept-louvor' })).toBe(true);
      expect(can(gestorA, 'department:member:remove', { departmentId: 'dept-louvor' })).toBe(true);
      expect(can(gestorA, 'registration:approve', { departmentId: 'dept-louvor' })).toBe(true);

      // Dept B (Mídia) -> Estritamente NEGADO
      expect(can(gestorA, 'assignment:create', { departmentId: 'dept-midia' })).toBe(false);
      expect(can(gestorA, 'assignment:delete', { departmentId: 'dept-midia' })).toBe(false);
      expect(can(gestorA, 'department:member:add', { departmentId: 'dept-midia' })).toBe(false);
      expect(can(gestorA, 'department:member:remove', { departmentId: 'dept-midia' })).toBe(false);
      expect(can(gestorA, 'registration:approve', { departmentId: 'dept-midia' })).toBe(false);
    });

    it('consultas scoped geram cláusulas restritas para o Gestor A', () => {
      const deptWhere = buildDepartmentScopeWhere(gestorA, 'department:update');
      expect(deptWhere).toEqual({
        id: { in: ['dept-louvor'] },
        churchId: 'igreja-1',
      });

      const assignWhere = buildAssignmentScopeWhere(gestorA, 'assignment:delete');
      expect(assignWhere).toEqual({
        slot: {
          departmentId: { in: ['dept-louvor'] },
        },
      });
    });
  });

  describe('3. Membro Comum vs Rotas de Gestão', () => {
    it('membro comum não tem acesso a ações de gestão nem listagem de voluntários', () => {
      expect(can(membroVoluntario, 'assignment:create', { departmentId: 'dept-louvor' })).toBe(false);
      expect(can(membroVoluntario, 'assignment:delete', { departmentId: 'dept-louvor' })).toBe(false);
      expect(can(membroVoluntario, 'member:list')).toBe(false);
      expect(can(membroVoluntario, 'member:create')).toBe(false);
      expect(can(membroVoluntario, 'registration:approve')).toBe(false);
      expect(can(membroVoluntario, 'church:settings:update')).toBe(false);
    });

    it('membro comum acessa apenas seus próprios recursos', () => {
      expect(can(membroVoluntario, 'profile:view:own', { targetUserId: membroVoluntario.id })).toBe(true);
      expect(can(membroVoluntario, 'assignment:view:own', { targetUserId: membroVoluntario.id })).toBe(true);
      expect(can(membroVoluntario, 'assignment:confirm:own', { targetUserId: membroVoluntario.id })).toBe(true);

      // Tentativa de alterar recurso de outro membro (IDOR) é bloqueada
      expect(can(membroVoluntario, 'assignment:confirm:own', { targetUserId: 'outro-usuario' })).toBe(false);
      expect(can(membroVoluntario, 'profile:update:own', { targetUserId: 'outro-usuario' })).toBe(false);
    });
  });

  describe('4. Regra 11: Ninguém Altera o Próprio Papel', () => {
    it('bloqueia tentativa de qualquer usuário mudar o próprio cargo na função can()', () => {
      expect(can(adminMaster, 'profile:update:other', { targetUserId: adminMaster.id, newRole: 'USER' })).toBe(false);
      expect(can(pastor, 'profile:update:other', { targetUserId: pastor.id, newRole: 'ADMIN_MASTER' })).toBe(false);
      expect(can(elder, 'profile:update:other', { targetUserId: elder.id, newRole: 'PASTOR' })).toBe(false);
      expect(can(gestorA, 'profile:update:other', { targetUserId: gestorA.id, newRole: 'ELDER' })).toBe(false);
    });

    it('rejeita na transação do banco quando o próprio usuário tenta mudar seu cargo', async () => {
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: 'user-admin',
        globalRole: 'ADMIN_MASTER',
        churchId: 'igreja-1',
        email: 'admin@revezo.com',
        memberships: [],
      });

      await expect(
        adminUpdateMemberWithAudit({
          userId: 'user-admin',
          actorId: 'user-admin', // Mesmo usuário tentando mudar seu papel
          actorRole: 'ADMIN_MASTER',
          globalRole: 'USER',
        })
      ).rejects.toThrow('Operação negada: nenhum usuário pode alterar o próprio papel.');
    });
  });

  describe('5. Regra 11: Proteção do Último ADMIN_MASTER Ativo', () => {
    it('impede rebaixamento ou inativação do único ADMIN_MASTER ativo do sistema', async () => {
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: 'admin-alvo',
        globalRole: 'ADMIN_MASTER',
        status: 'ACTIVE',
        churchId: null,
        email: 'admin@revezo.com',
        memberships: [],
      });

      // Simula que existe apenas 1 ADMIN_MASTER ativo no banco
      mockTx.user.count.mockResolvedValueOnce(1);

      await expect(
        adminUpdateMemberWithAudit({
          userId: 'admin-alvo',
          actorId: 'outro-admin',
          actorRole: 'ADMIN_MASTER',
          globalRole: 'USER',
        })
      ).rejects.toThrow('Operação negada: o sistema deve possuir pelo menos um Administrador Master ativo.');
    });

    it('impede inativação do único ADMIN_MASTER ativo', async () => {
      mockTx.user.findUnique.mockResolvedValueOnce({
        id: 'admin-alvo',
        globalRole: 'ADMIN_MASTER',
        status: 'ACTIVE',
        churchId: null,
        email: 'admin@revezo.com',
        memberships: [],
      });

      mockTx.user.count.mockResolvedValueOnce(1);

      await expect(
        adminUpdateMemberWithAudit({
          userId: 'admin-alvo',
          actorId: 'outro-admin',
          actorRole: 'ADMIN_MASTER',
          status: 'INACTIVE',
        })
      ).rejects.toThrow('Operação negada: o sistema deve possuir pelo menos um Administrador Master ativo.');
    });
  });
});
