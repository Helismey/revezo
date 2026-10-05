import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET as handleAuditoriaGet } from '../src/app/api/auditoria/route';
import { GET as handleHistoricoEscalasGet } from '../src/app/api/relatorios/historico-escalas/route';
import { GET as handleParticipacaoGet } from '../src/app/api/relatorios/participacao/route';
import * as authService from '../src/lib/auth-service';
import * as db from '@revezo/db';

vi.mock('@revezo/db', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-mock' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    department: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  recordAudit: vi.fn().mockResolvedValue({ id: 'audit-mock' }),
  queryAuditLogs: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'log-1',
        churchId: 'church-sede',
        churchName: 'Sede Central',
        actorId: 'usr-admin',
        actor: { id: 'usr-admin', name: 'Admin Geral', email: 'admin@revezo.com.br' },
        action: 'ASSIGNMENT_CREATED',
        targetType: 'Assignment',
        targetId: 'asg-1',
        targetUser: { id: 'usr-vol', name: 'Lucas Silva', email: 'lucas@revezo.com.br' },
        result: 'SUCCESS',
        ip: '192.168.1.1',
        meta: { slotId: 'slot-1' },
        createdAt: new Date('2026-10-05T10:00:00Z'),
      },
    ],
    pagination: {
      page: 1,
      limit: 50,
      totalCount: 1,
      totalPages: 1,
      hasMore: false,
    },
  }),
  getScheduleHistory: vi.fn().mockResolvedValue({
    events: [
      {
        id: 'hist-1',
        timestamp: new Date('2026-10-05T10:00:00Z'),
        eventType: 'SUBSTITUTED',
        actionLabel: 'Substituído automaticamente',
        actionCode: 'ASSIGNMENT_AUTO_SUBSTITUTED',
        actor: { id: null, name: 'Sistema (Automático)', isSystem: true },
        volunteer: { id: 'usr-orig', name: 'Lucas Silva', email: 'lucas@revezo.com.br' },
        substitute: { id: 'usr-sub', name: 'Mariana Ramos', email: 'mariana@revezo.com.br' },
        slot: {
          id: 'slot-1',
          title: 'Louvor - Bateria',
          startsAt: new Date('2026-10-12T19:00:00Z'),
          endsAt: new Date('2026-10-12T21:00:00Z'),
          programTitle: 'Culto de Domingo',
          departmentName: 'Louvor',
          functionName: 'Baterista',
        },
        details: { reason: 'Viagem de trabalho' },
      },
    ],
    pagination: {
      page: 1,
      limit: 50,
      totalCount: 1,
      totalPages: 1,
      hasMore: false,
    },
  }),
  getDepartmentParticipationReport: vi.fn().mockResolvedValue({
    period: { from: '2026-07-01T00:00:00Z', to: '2026-10-05T00:00:00Z' },
    totals: {
      totalAssignments: 10,
      confirmedCount: 8,
      declinedCount: 1,
      substitutedCount: 1,
      pendingCount: 0,
      confirmationRate: 80,
    },
    volunteers: [
      {
        userId: 'usr-1',
        name: 'Lucas Silva',
        email: 'lucas@revezo.com.br',
        departmentNames: ['Louvor'],
        totalScheduled: 10,
        confirmed: 8,
        declined: 1,
        substituted: 1,
        pending: 0,
        lastServedAt: new Date(),
      },
    ],
    departments: [{ id: 'dept-louvor', name: 'Louvor' }],
  }),
}));

describe('Auditoria e Histórico — Rotas de API e Segurança (/api/auditoria & /api/relatorios)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Endpoint de Trilha de Auditoria (GET /api/auditoria)', () => {
    it('retorna 401 se a requisição não estiver autenticada', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue(null);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue(null);

      const req = new Request('http://localhost:3000/api/auditoria');
      const res = await handleAuditoriaGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Não autenticado');
    });

    it('retorna 403 e registra tentativa negada se usuário não for ADMIN_MASTER', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-gestor' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-gestor',
        globalRole: 'VOLUNTEER',
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({
        activeChurch: { id: 'church-sede', name: 'Sede' } as any,
      } as any);

      const req = new Request('http://localhost:3000/api/auditoria');
      const res = await handleAuditoriaGet(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('ADMIN_MASTER');

      // Verifica se o acesso indevido foi registrado na auditoria
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'AUDIT_TRAIL_ACCESS_DENIED',
          result: 'DENIED',
        })
      );
    });

    it('permite consulta de auditoria com paginação para ADMIN_MASTER', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-admin' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-admin',
        globalRole: 'ADMIN_MASTER',
        status: 'ACTIVE',
        departmentMemberships: [],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({
        activeChurch: { id: 'church-sede' } as any,
      } as any);

      const req = new Request('http://localhost:3000/api/auditoria?page=1&limit=50');
      const res = await handleAuditoriaGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.items.length).toBe(1);
      expect(data.items[0].action).toBe('ASSIGNMENT_CREATED');
    });

    it('exporta CSV e registra evento DATA_EXPORTED na trilha de auditoria', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-admin' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-admin',
        globalRole: 'ADMIN_MASTER',
        status: 'ACTIVE',
        departmentMemberships: [],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({
        activeChurch: { id: 'church-sede' } as any,
      } as any);

      const req = new Request('http://localhost:3000/api/auditoria?format=csv');
      const res = await handleAuditoriaGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('Data e Hora');
      expect(text).toContain('ASSIGNMENT_CREATED');

      // Garantia Regra 19: Exportação registrada na trilha
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'DATA_EXPORTED',
          targetType: 'AuditLog',
          result: 'SUCCESS',
        })
      );
    });
  });

  describe('2. Endpoint de Histórico de Escalas (/api/relatorios/historico-escalas)', () => {
    it('permite que gestor de departamento consulte o histórico de escalas', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-gestor' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-gestor',
        globalRole: 'VOLUNTEER',
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({ activeChurch: null } as any);

      const req = new Request(
        'http://localhost:3000/api/relatorios/historico-escalas?departmentId=dept-louvor'
      );
      const res = await handleHistoricoEscalasGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.events.length).toBe(1);
      expect(data.events[0].actionLabel).toBe('Substituído automaticamente');
      expect(data.events[0].volunteer.name).toBe('Lucas Silva');
      expect(data.events[0].substitute.name).toBe('Mariana Ramos');
    });

    it('impede que gestor acesse histórico de departamento que não gerencia (Anti-IDOR)', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-gestor' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-gestor',
        globalRole: 'VOLUNTEER',
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({ activeChurch: null } as any);

      const req = new Request(
        'http://localhost:3000/api/relatorios/historico-escalas?departmentId=dept-infantil'
      );
      const res = await handleHistoricoEscalasGet(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Você não tem permissão');
    });

    it('exporta CSV da linha do tempo e registra evento DATA_EXPORTED', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-gestor' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-gestor',
        globalRole: 'VOLUNTEER',
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({ activeChurch: null } as any);

      const req = new Request(
        'http://localhost:3000/api/relatorios/historico-escalas?departmentId=dept-louvor&format=csv'
      );
      const res = await handleHistoricoEscalasGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('Lucas Silva');
      expect(text).toContain('Mariana Ramos');

      // Exportação registrada em auditoria
      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'DATA_EXPORTED',
          targetType: 'ScheduleHistory',
          result: 'SUCCESS',
        })
      );
    });
  });

  describe('3. Exportação do Relatório de Participação (/api/relatorios/participacao)', () => {
    it('registra DATA_EXPORTED ao exportar relatório de participação em CSV', async () => {
      vi.spyOn(authService, 'getSession').mockResolvedValue({ userId: 'usr-gestor' } as any);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: 'usr-gestor',
        globalRole: 'VOLUNTEER',
        status: 'ACTIVE',
        departmentMemberships: [{ departmentId: 'dept-louvor', role: 'MANAGER' }],
      } as any);
      vi.spyOn(authService, 'getActiveChurchContext').mockResolvedValue({
        activeChurch: { id: 'church-sede' } as any,
      } as any);

      const req = new Request(
        'http://localhost:3000/api/relatorios/participacao?departmentId=dept-louvor&format=csv'
      );
      const res = await handleParticipacaoGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');

      expect(db.recordAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'DATA_EXPORTED',
          targetType: 'Report',
          targetId: 'PARTICIPATION_REPORT_CSV',
          result: 'SUCCESS',
        })
      );
    });
  });
});
