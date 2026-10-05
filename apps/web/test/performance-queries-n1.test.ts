import { describe, expect, it, vi, beforeEach } from 'vitest';
import { prisma, getScheduleHistory, getDepartmentParticipationReport, queryAuditLogs } from '@revezo/db';

describe('Testes de Desempenho e Prevenção de N+1 (Skill testes-desempenho)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Histórico de Escalas: Busca 100 eventos executando exatamente O(1) consultas em lote (Teto: <= 4 queries)', async () => {
    let queryCount = 0;

    // Spy nas operações do Prisma para registrar cada consulta SQL emitida
    const auditSpy = vi.spyOn(prisma.auditLog, 'findMany').mockImplementation((async () => {
      queryCount++;
      // Simula 100 logs de auditoria de substituições, confirmações e atribuições
      return Array.from({ length: 100 }, (_, i) => ({
        id: `log-${i + 1}`,
        churchId: 'church-1',
        actorId: `usr-actor-${i % 5}`,
        action: i % 2 === 0 ? 'ASSIGNMENT_CREATED' : 'AUTO_SUBSTITUTION_ASSIGNED',
        targetType: 'Assignment',
        targetId: `asg-${i + 1}`,
        result: 'SUCCESS',
        ip: '127.0.0.1',
        meta: {
          slotId: `slot-${i + 1}`,
          userId: `usr-vol-${i + 1}`,
          newUserId: `usr-sub-${i + 1}`,
        },
        createdAt: new Date('2026-10-01T10:00:00Z'),
      }));
    }) as any);

    const assignmentSpy = vi.spyOn(prisma.assignment, 'findMany').mockImplementation((async () => {
      queryCount++;
      return [];
    }) as any);

    const swapSpy = vi.spyOn(prisma.swapRequest, 'findMany').mockImplementation((async () => {
      queryCount++;
      return [];
    }) as any);

    const userSpy = vi.spyOn(prisma.user, 'findMany').mockImplementation((async () => {
      queryCount++;
      return [];
    }) as any);

    const result = await getScheduleHistory({
      churchId: 'church-1',
      limit: 50,
      page: 1,
    });

    expect(result).toBeDefined();

    // Verificação estrita contra N+1:
    // Se houvesse N+1, seriam 100 consultas individuais de assignment + 100 de user = 200+ queries!
    // Com batching consolidado (IN (...)), o número total DEVE ser no máximo 4 queries.
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(assignmentSpy).toHaveBeenCalledTimes(1);
    expect(swapSpy).toHaveBeenCalledTimes(1);
    expect(userSpy).toHaveBeenCalledTimes(1);

    expect(queryCount).toBeLessThanOrEqual(4);
    console.info(`[N+1 Test] getScheduleHistory processou 100 logs emitindo exatamente: ${queryCount} queries (Zero N+1)`);
  });

  it('Relatório de Participação: Consolida múltiplos departamentos e membros em exatamente 2 consultas SQL', async () => {
    let queryCount = 0;

    const deptSpy = vi.spyOn(prisma.department, 'findMany').mockImplementation((async () => {
      queryCount++;
      return [
        {
          id: 'dept-1',
          name: 'Louvor',
          churchId: 'church-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          functions: [{ id: 'f1', name: 'Vocal', departmentId: 'dept-1' }],
          members: Array.from({ length: 30 }, (_, i) => ({
            id: `dm-${i}`,
            departmentId: 'dept-1',
            userId: `usr-${i}`,
            role: 'VOLUNTEER',
            createdAt: new Date(),
            user: { id: `usr-${i}`, name: `Membro ${i}`, email: `m${i}@igreja.local` },
          })),
        },
      ] as any;
    }) as any);

    const asgSpy = vi.spyOn(prisma.assignment, 'findMany').mockImplementation((async () => {
      queryCount++;
      return Array.from({ length: 50 }, (_, i) => ({
        id: `asg-${i}`,
        slotId: `slot-${i}`,
        userId: `usr-${i % 30}`,
        status: i % 3 === 0 ? 'CONFIRMED' : 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: `usr-${i % 30}`, name: `Membro ${i % 30}`, email: `m@igreja.local` },
        slot: {
          id: `slot-${i}`,
          departmentId: 'dept-1',
          functionId: 'f1',
          programId: 'prog-1',
          title: `Slot ${i}`,
          startsAt: new Date(),
          endsAt: new Date(),
          department: { id: 'dept-1', name: 'Louvor' },
          function: { id: 'f1', name: 'Vocal' },
          program: { id: 'prog-1', title: 'Culto' },
        },
      })) as any;
    }) as any);

    const report = await getDepartmentParticipationReport({
      departmentId: 'dept-1',
      churchId: 'church-1',
    });

    expect(report).toBeDefined();

    // Verificação estrita contra N+1:
    // Nunca deve fazer consultas no loop para cada membro ou função
    expect(deptSpy).toHaveBeenCalledTimes(1);
    expect(asgSpy).toHaveBeenCalledTimes(1);
    expect(queryCount).toBe(2);

    console.info(`[N+1 Test] getDepartmentParticipationReport gerou estatísticas de 30 membros e 50 escalas com: ${queryCount} queries`);
  });

  it('Trilha de Auditoria Geral: Listagem paginada de logs não gera queries por registro (Teto: <= 4 queries)', async () => {
    let queryCount = 0;

    const findManySpy = vi.spyOn(prisma.auditLog, 'findMany').mockImplementation((async () => {
      queryCount++;
      return Array.from({ length: 25 }, (_, i) => ({
        id: `log-${i}`,
        churchId: 'church-1',
        actorId: `actor-${i % 3}`,
        action: 'USER_PROFILE_UPDATED',
        targetType: 'User',
        targetId: `usr-${i}`,
        result: 'SUCCESS',
        ip: '10.0.0.1',
        meta: {},
        church: { id: 'church-1', name: 'Igreja Central' },
        createdAt: new Date(),
      }));
    }) as any);

    const countSpy = vi.spyOn(prisma.auditLog, 'count').mockImplementation((async () => {
      queryCount++;
      return 120;
    }) as any);

    const userSpy = vi.spyOn(prisma.user, 'findMany').mockImplementation((async () => {
      queryCount++;
      return [];
    }) as any);

    const result = await queryAuditLogs({
      churchId: 'church-1',
      page: 1,
      limit: 25,
    });

    expect(result.items.length).toBe(25);
    expect(findManySpy).toHaveBeenCalledTimes(1);
    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(userSpy).toHaveBeenCalledTimes(1);

    // Exatamente 3 queries consolidadas (count + findMany com include + user batch)
    expect(queryCount).toBeLessThanOrEqual(3);
    console.info(`[N+1 Test] queryAuditLogs listou 25 logs paginados com: ${queryCount} queries`);
  });
});
