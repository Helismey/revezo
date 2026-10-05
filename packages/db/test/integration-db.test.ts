import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../src/client.js';

let testHeaders = new Headers();
let testCookieToken: string | undefined;

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => testHeaders),
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => testCookieToken ? { value: testCookieToken } : undefined),
    delete: vi.fn(),
    set: vi.fn(),
  })),
}));
import {
  assignMemberWithLock,
  consumeConfirmationTokenWithAudit,
  createConfirmationTokenWithAudit,
  recordNotificationLog,
  getDepartmentParticipationReport,
} from '../src/transactions.js';
import { queryAuditLogs } from '../src/audit.js';
import {
  resetDatabase,
  createTestChurch,
  createTestUser,
  createTestDepartment,
  createTestProgramWithSlot,
  TEST_SECRET,
} from './test-helper.js';
import {
  can,
  identifyPendingReminders,
  AssignmentForReminder,
  ExistingNotificationLog,
} from '@revezo/domain';

describe('Testes de Integração com Banco de Dados Real (PostgreSQL)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('1. Verificação de Migrations e Integridade Estrutural', () => {
    it('deve confirmar que todas as migrations foram aplicadas do zero com sucesso no banco', async () => {
      const migrations = await prisma.$queryRawUnsafe<
        { migration_name: string; finished_at: Date | null; applied_steps_count: number }[]
      >('SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at ASC;');

      expect(migrations.length).toBeGreaterThanOrEqual(3);
      for (const mig of migrations) {
        expect(mig.finished_at).not.toBeNull();
        expect(mig.applied_steps_count).toBeGreaterThan(0);
      }

      const migrationNames = migrations.map((m) => m.migration_name);
      expect(migrationNames).toContain('20261001000000_init_schema');
      expect(migrationNames).toContain('20261001010000_multi_church_and_roles');
      expect(migrationNames).toContain('20261001020000_minor_protection_and_indexes');
    });

    it('deve confirmar a existência de tabelas fundamentais no schema public', async () => {
      const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
      );
      const tableNames = tables.map((t) => t.table_name);

      expect(tableNames).toContain('Church');
      expect(tableNames).toContain('User');
      expect(tableNames).toContain('Department');
      expect(tableNames).toContain('Program');
      expect(tableNames).toContain('ProgramSlot');
      expect(tableNames).toContain('Assignment');
      expect(tableNames).toContain('NotificationLog');
      expect(tableNames).toContain('AuditLog');
      expect(tableNames).toContain('ActionToken');
      expect(tableNames).toContain('RefreshToken');
    });
  });

  describe('2. Transações Atômicas e Bloqueio (assignMemberWithLock)', () => {
    it('deve atribuir voluntário ativo com sucesso e registrar log de auditoria', async () => {
      const church = await createTestChurch();
      const department = await createTestDepartment(church.id);
      const user = await createTestUser({ churchId: church.id });
      const actor = await createTestUser({ churchId: church.id, globalRole: 'ADMIN_MASTER' });

      const startsAt = new Date('2026-11-01T10:00:00Z');
      const endsAt = new Date('2026-11-01T12:00:00Z');
      const { slot } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: department.id,
        startsAt,
        endsAt,
      });

      const assignment = await assignMemberWithLock({
        slotId: slot.id,
        userId: user.id,
        actorId: actor.id,
        ip: '127.0.0.1',
      });

      expect(assignment).toBeDefined();
      expect(assignment.userId).toBe(user.id);
      expect(assignment.slotId).toBe(slot.id);
      expect(assignment.status).toBe('PENDING');

      // Verifica persistência real no PostgreSQL
      const dbAssignment = await prisma.assignment.findUnique({
        where: { id: assignment.id },
      });
      expect(dbAssignment).not.toBeNull();
      expect(dbAssignment?.userId).toBe(user.id);

      // Verifica log de auditoria obrigatório gerado dentro da transação
      const logs = await prisma.auditLog.findMany({
        where: { targetId: assignment.id, action: 'ASSIGNMENT_CREATED' },
      });
      expect(logs.length).toBe(1);
      expect(logs[0].actorId).toBe(actor.id);
      expect(logs[0].result).toBe('SUCCESS');
    });

    it('deve rejeitar e reverter transação quando houver conflito de horário', async () => {
      const church = await createTestChurch();
      const dep1 = await createTestDepartment(church.id, 'Louvor');
      const dep2 = await createTestDepartment(church.id, 'Mídia');
      const user = await createTestUser({ churchId: church.id });

      const startsAt1 = new Date('2026-11-01T10:00:00Z');
      const endsAt1 = new Date('2026-11-01T12:00:00Z');
      const { slot: slot1 } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep1.id,
        startsAt: startsAt1,
        endsAt: endsAt1,
      });

      // Atribuição 1 no Louvor
      await assignMemberWithLock({
        slotId: slot1.id,
        userId: user.id,
      });

      // Slot 2 na Mídia sobreposto no mesmo horário (11:00 às 13:00)
      const startsAt2 = new Date('2026-11-01T11:00:00Z');
      const endsAt2 = new Date('2026-11-01T13:00:00Z');
      const { slot: slot2 } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep2.id,
        startsAt: startsAt2,
        endsAt: endsAt2,
      });

      await expect(
        assignMemberWithLock({
          slotId: slot2.id,
          userId: user.id,
        })
      ).rejects.toThrow(/já tem uma escala nesse horário/i);

      // Garante atomicidade: nenhuma escala no slot2 foi salva no banco
      const assignmentsSlot2 = await prisma.assignment.findMany({
        where: { slotId: slot2.id },
      });
      expect(assignmentsSlot2).toHaveLength(0);
    });

    it('deve impedir que voluntário exceda o limite diário de 2 escalas', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id);
      const user = await createTestUser({ churchId: church.id });

      // Escala 1 pela manhã
      const { slot: slot1 } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-01T08:00:00Z'),
        endsAt: new Date('2026-11-01T10:00:00Z'),
      });
      await assignMemberWithLock({ slotId: slot1.id, userId: user.id });

      // Escala 2 à tarde
      const { slot: slot2 } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-01T14:00:00Z'),
        endsAt: new Date('2026-11-01T16:00:00Z'),
      });
      await assignMemberWithLock({ slotId: slot2.id, userId: user.id });

      // Tentativa de 3ª escala no mesmo dia
      const { slot: slot3 } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-01T19:00:00Z'),
        endsAt: new Date('2026-11-01T21:00:00Z'),
      });

      await expect(
        assignMemberWithLock({ slotId: slot3.id, userId: user.id })
      ).rejects.toThrow(/Já são 2 escalas neste dia/i);

      const assignmentsSlot3 = await prisma.assignment.findMany({
        where: { slotId: slot3.id },
      });
      expect(assignmentsSlot3).toHaveLength(0);
    });

    it('deve respeitar período de indisponibilidade cadastrado pelo voluntário', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id);
      const user = await createTestUser({ churchId: church.id });

      // Cadastra férias/indisponibilidade
      await prisma.availability.create({
        data: {
          userId: user.id,
          kind: 'UNAVAILABLE_PERIOD',
          from: new Date('2026-11-01T00:00:00Z'),
          to: new Date('2026-11-05T23:59:59Z'),
        },
      });

      const { slot } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-02T10:00:00Z'),
        endsAt: new Date('2026-11-02T12:00:00Z'),
      });

      await expect(
        assignMemberWithLock({ slotId: slot.id, userId: user.id })
      ).rejects.toThrow(/registrou indisponibilidade para este período/i);
    });
  });

  describe('3. Consultas por Escopo, Multi-Igreja e Proteção Anti-IDOR', () => {
    it('deve impedir que voluntário de uma congregação seja escalado em outra congregação', async () => {
      const churchA = await createTestChurch('Igreja Central');
      const churchB = await createTestChurch('Igreja Bairro Novo');

      const depB = await createTestDepartment(churchB.id, 'Infantil');
      const userA = await createTestUser({ churchId: churchA.id });

      const { slot: slotB } = await createTestProgramWithSlot({
        churchId: churchB.id,
        departmentId: depB.id,
        startsAt: new Date('2026-11-01T10:00:00Z'),
        endsAt: new Date('2026-11-01T12:00:00Z'),
      });

      await expect(
        assignMemberWithLock({
          slotId: slotB.id,
          userId: userA.id,
        })
      ).rejects.toThrow(/Não é possível escalar um voluntário vinculado a outra congregação/i);
    });

    it('deve garantir que gestor do departamento A não tenha permissão no departamento B (Anti-IDOR)', async () => {
      const church = await createTestChurch();
      const depA = await createTestDepartment(church.id, 'Diaconia');
      const depB = await createTestDepartment(church.id, 'Sonoplastia');

      const gestorUser = await createTestUser({ churchId: church.id });

      // Vincula o usuário como MANAGER apenas no depA
      await prisma.departmentMember.create({
        data: {
          departmentId: depA.id,
          userId: gestorUser.id,
          role: 'MANAGER',
        },
      });

      const userContext = {
        id: gestorUser.id,
        globalRole: 'USER' as const,
        status: 'ACTIVE' as const,
        churchId: church.id,
        departmentMemberships: [{ departmentId: depA.id, role: 'MANAGER' as const }],
      };

      // Gestor pode atribuir no departamento A
      const canManageA = can(userContext, 'assignment:create', { departmentId: depA.id, churchId: church.id });
      expect(canManageA).toBe(true);

      // Gestor NÃO PODE atribuir no departamento B
      const canManageB = can(userContext, 'assignment:create', { departmentId: depB.id, churchId: church.id });
      expect(canManageB).toBe(false);
    });

    it('deve isolar o relatório de participação por departamento e congregação', async () => {
      const church = await createTestChurch();
      const depA = await createTestDepartment(church.id, 'Mídia');
      const depB = await createTestDepartment(church.id, 'Louvor');

      const userA = await createTestUser({ churchId: church.id, name: 'Voluntario Midia' });
      const userB = await createTestUser({ churchId: church.id, name: 'Voluntario Louvor' });

      await prisma.departmentMember.createMany({
        data: [
          { departmentId: depA.id, userId: userA.id, role: 'MEMBER' },
          { departmentId: depB.id, userId: userB.id, role: 'MEMBER' },
        ],
      });

      const { slot: slotA } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: depA.id,
        startsAt: new Date('2026-11-01T10:00:00Z'),
        endsAt: new Date('2026-11-01T12:00:00Z'),
      });
      await assignMemberWithLock({ slotId: slotA.id, userId: userA.id });

      // Consulta o relatório exclusivo do departamento A
      const reportA = await getDepartmentParticipationReport({
        departmentId: depA.id,
        from: new Date('2026-11-01T00:00:00Z'),
        to: new Date('2026-11-01T23:59:59Z'),
      });

      expect(reportA.departments[0].id).toBe(depA.id);
      expect(reportA.totals.totalAssignments).toBe(1);
      const memberA = reportA.volunteers.find((m) => m.userId === userA.id);
      expect(memberA).toBeDefined();
      expect(memberA?.totalScheduled).toBe(1);

      // Garante que o voluntário do depB não aparece no relatório do depA
      const memberB = reportA.volunteers.find((m) => m.userId === userB.id);
      expect(memberB).toBeUndefined();
    });

    it('deve filtrar logs de auditoria estritamente por igreja', async () => {
      const churchA = await createTestChurch('Igreja Central');
      const churchB = await createTestChurch('Igreja Zona Norte');

      await prisma.auditLog.createMany({
        data: [
          { churchId: churchA.id, action: 'DEPARTMENT_CREATED', result: 'SUCCESS' },
          { churchId: churchA.id, action: 'USER_REGISTERED', result: 'SUCCESS' },
          { churchId: churchB.id, action: 'DEPARTMENT_CREATED', result: 'SUCCESS' },
        ],
      });

      const logsA = await queryAuditLogs({ churchId: churchA.id });
      expect(logsA.pagination.totalCount).toBe(2);
      expect(logsA.items.every((l) => l.churchId === churchA.id)).toBe(true);

      const logsB = await queryAuditLogs({ churchId: churchB.id });
      expect(logsB.pagination.totalCount).toBe(1);
      expect(logsB.items[0].churchId).toBe(churchB.id);
    });
  });

  describe('4. Constraints, Unicidade e Imutabilidade do AuditLog', () => {
    it('deve lançar erro de violação de unicidade ao duplicar nome de departamento na mesma igreja', async () => {
      const church = await createTestChurch();
      await prisma.department.create({
        data: {
          churchId: church.id,
          name: 'Comunicação',
        },
      });

      await expect(
        prisma.department.create({
          data: {
            churchId: church.id,
            name: 'Comunicação',
          },
        })
      ).rejects.toThrow();
    });

    it('deve lançar erro de violação de unicidade ao cadastrar dois usuários com mesmo email', async () => {
      await createTestUser({ email: 'duplicado@igreja.local' });

      await expect(
        createTestUser({ email: 'duplicado@igreja.local' })
      ).rejects.toThrow();
    });

    it('deve respeitar a integridade referencial de chave estrangeira', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id);

      // Tentar associar membro com userId inexistente
      await expect(
        prisma.departmentMember.create({
          data: {
            departmentId: dep.id,
            userId: 'user_inexistente_12345',
            role: 'MEMBER',
          },
        })
      ).rejects.toThrow();
    });

    it('deve bloquear estritamente atualizações e exclusões em AuditLog (Regra 19 - Append-Only)', async () => {
      const log = await prisma.auditLog.create({
        data: {
          action: 'SECURITY_TEST',
          result: 'SUCCESS',
        },
      });

      // Tentar update
      await expect(
        prisma.auditLog.update({
          where: { id: log.id },
          data: { action: 'HACKED' },
        })
      ).rejects.toThrow(/AuditLog é somente-inserção/i);

      // Tentar delete
      await expect(
        prisma.auditLog.delete({
          where: { id: log.id },
        })
      ).rejects.toThrow(/AuditLog é somente-inserção/i);
    });
  });

  describe('5. Cron de Lembretes e Idempotência no Banco de Dados', () => {
    it('deve registrar lembrete na primeira execução e não duplicar na segunda execução', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id, 'Louvor');
      const user = await createTestUser({ churchId: church.id });

      // Escala para daqui a 7 dias
      const fixedNow = new Date('2026-11-01T10:00:00Z');
      const startsAt = new Date('2026-11-08T10:00:00Z');
      const endsAt = new Date('2026-11-08T12:00:00Z');

      const { slot } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt,
        endsAt,
      });

      const assignment = await assignMemberWithLock({
        slotId: slot.id,
        userId: user.id,
      });

      // Monta dados para o cálculo de lembretes
      const domainAssignment: AssignmentForReminder = {
        id: assignment.id,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPhonePrimary: user.phonePrimary,
        preferredChannel: 'WHATSAPP',
        optOutWhatsapp: false,
        optOutEmail: false,
        optOutPush: false,
        optOutSms: true,
        startsAt,
        endsAt,
        status: 'PENDING',
        programTitle: 'Culto de Domingo',
        departmentName: 'Louvor',
      };

      // Execução 1: sem logs prévios no banco
      const existingLogsFirstRun: ExistingNotificationLog[] = [];
      const pendingFirst = identifyPendingReminders([domainAssignment], existingLogsFirstRun, fixedNow);
      expect(pendingFirst).toHaveLength(1);
      expect(pendingFirst[0].kind).toBe('D7');

      // Persiste o envio com sucesso no banco de dados real
      await recordNotificationLog({
        assignmentId: assignment.id,
        kind: 'D7',
        channel: 'WHATSAPP',
        success: true,
      });

      // Busca os logs gravados no banco
      const dbLogs = await prisma.notificationLog.findMany({
        where: { assignmentId: assignment.id },
      });
      expect(dbLogs).toHaveLength(1);
      expect(dbLogs[0].kind).toBe('D7');
      expect(dbLogs[0].success).toBe(true);

      // Execução 2 (segunda rodada do cron): lê os logs reais do banco
      const existingLogsSecondRun: ExistingNotificationLog[] = dbLogs.map((l) => ({
        assignmentId: l.assignmentId!,
        kind: l.kind as any,
        success: l.success,
      }));

      const pendingSecond = identifyPendingReminders([domainAssignment], existingLogsSecondRun, fixedNow);
      // Idempotência garantida: zero novos lembretes gerados!
      expect(pendingSecond).toHaveLength(0);

      // Total de logs no banco permanece 1
      const totalLogsAfter = await prisma.notificationLog.count({
        where: { assignmentId: assignment.id },
      });
      expect(totalLogsAfter).toBe(1);
    });
  });

  describe('6. Tokens de Confirmação de Presença e Consumo Único', () => {
    it('deve gerar token seguro, confirmar presença no banco e proibir reuso do token', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id);
      const user = await createTestUser({ churchId: church.id });

      const { slot } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-05T10:00:00Z'),
        endsAt: new Date('2026-11-05T12:00:00Z'),
      });

      const assignment = await assignMemberWithLock({
        slotId: slot.id,
        userId: user.id,
      });
      expect(assignment.status).toBe('PENDING');

      // 1. Gera token
      const tokenResult = await createConfirmationTokenWithAudit({
        assignmentId: assignment.id,
        maxDays: 7,
        actorId: 'CRON_TEST',
      });
      expect(tokenResult.rawToken).toBeDefined();

      // Confere que no banco só foi salvo o hash do token
      const storedToken = await prisma.actionToken.findUnique({
        where: { tokenHash: tokenResult.tokenHash },
      });
      expect(storedToken).not.toBeNull();
      expect(storedToken?.usedAt).toBeNull();

      // 2. Consome o token pela primeira vez com ação CONFIRM
      const consumeResult = await consumeConfirmationTokenWithAudit({
        rawToken: tokenResult.rawToken,
        action: 'CONFIRM',
        actorId: user.id,
      });

      expect(consumeResult.status).toBe('CONFIRMED');
      expect(consumeResult.assignmentId).toBe(assignment.id);

      // Verifica status atualizado no banco
      const updatedAssignment = await prisma.assignment.findUnique({
        where: { id: assignment.id },
      });
      expect(updatedAssignment?.status).toBe('CONFIRMED');

      // Verifica que o token foi marcado como usado
      const consumedToken = await prisma.actionToken.findUnique({
        where: { tokenHash: tokenResult.tokenHash },
      });
      expect(consumedToken?.usedAt).not.toBeNull();

      // 3. Tentativa de reusar o mesmo token deve falhar
      await expect(
        consumeConfirmationTokenWithAudit({
          rawToken: tokenResult.rawToken,
          action: 'CONFIRM',
          actorId: user.id,
        })
      ).rejects.toThrow(/já foi utilizado/i);
    });
  });

  describe('7. API Route com Sessão e Efeitos Reais no PostgreSQL', () => {
    it('deve simular POST /api/escalas/atribuir com autenticação, validação Zod e gravação no banco', async () => {
      const church = await createTestChurch();
      const dep = await createTestDepartment(church.id, 'Louvor');
      const gestor = await createTestUser({ churchId: church.id, globalRole: 'USER' });
      const voluntario = await createTestUser({ churchId: church.id, name: 'Voluntario Musical' });

      // Gestor no departamento
      await prisma.departmentMember.create({
        data: {
          departmentId: dep.id,
          userId: gestor.id,
          role: 'MANAGER',
        },
      });

      const { slot } = await createTestProgramWithSlot({
        churchId: church.id,
        departmentId: dep.id,
        startsAt: new Date('2026-11-10T19:00:00Z'),
        endsAt: new Date('2026-11-10T21:00:00Z'),
      });

      // Importa a rota dinamicamente
      const { POST } = await import('../../../apps/web/src/app/api/escalas/atribuir/route.js');

      const authService = await import('../../../apps/web/src/lib/auth-service.js');

      // Caso 1: Sem sessão autenticada -> 401
      vi.spyOn(authService, 'getSession').mockResolvedValue(null);
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue(null);

      const reqUnauthorized = new Request('http://localhost:3000/api/escalas/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, userId: voluntario.id }),
      });
      const resUnauth = await POST(reqUnauthorized);
      expect(resUnauth.status).toBe(401);

      // Caso 2: Com sessão válida de gestor, mas payload inválido no Zod -> 400
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: gestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        name: gestor.name,
        email: gestor.email,
        createdAt: Date.now(),
      });
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: gestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        churchId: church.id,
        departmentMemberships: [{ departmentId: dep.id, role: 'MANAGER' }],
      });

      const reqInvalid = new Request('http://localhost:3000/api/escalas/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id }), // faltando userId
      });
      const resInvalid = await POST(reqInvalid);
      expect(resInvalid.status).toBe(400);

      // Caso 3: Gestor de outro departamento tentando escalar aqui (Anti-IDOR) -> 403
      const outroGestor = await createTestUser({ churchId: church.id, email: 'outro.gestor@igreja.local' });
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: outroGestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        name: outroGestor.name,
        email: outroGestor.email,
        createdAt: Date.now(),
      });
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: outroGestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        churchId: church.id,
        departmentMemberships: [{ departmentId: 'outro_dep_qualquer', role: 'MANAGER' }],
      });

      const reqForbidden = new Request('http://localhost:3000/api/escalas/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, userId: voluntario.id }),
      });
      const resForbidden = await POST(reqForbidden);
      expect(resForbidden.status).toBe(403);
      const jsonForbidden = await resForbidden.json();
      expect(jsonForbidden.error).toMatch(/Você não tem permissão para escalar neste departamento/i);

      // Caso 4: Gestor autorizado atribuindo -> 200 e gravação no banco PostgreSQL real
      vi.spyOn(authService, 'getSession').mockResolvedValue({
        userId: gestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        name: gestor.name,
        email: gestor.email,
        createdAt: Date.now(),
      });
      vi.spyOn(authService, 'getCurrentUserContext').mockResolvedValue({
        id: gestor.id,
        globalRole: 'USER',
        status: 'ACTIVE',
        churchId: church.id,
        departmentMemberships: [{ departmentId: dep.id, role: 'MANAGER' }],
      });

      const reqSuccess = new Request('http://localhost:3000/api/escalas/atribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, userId: voluntario.id }),
      });
      const resSuccess = await POST(reqSuccess);
      expect(resSuccess.status).toBe(200);
      const jsonSuccess = await resSuccess.json();
      expect(jsonSuccess.success).toBe(true);

      // Confere que o Assignment foi realmente persistido no PostgreSQL
      const savedAssignment = await prisma.assignment.findFirst({
        where: { slotId: slot.id, userId: voluntario.id },
      });
      expect(savedAssignment).not.toBeNull();
      expect(savedAssignment?.status).toBe('PENDING');
    });
  });
});
