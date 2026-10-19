import { randomUUID } from 'crypto';
import { prisma } from '../client.js';
import {
  findConflictingAssignment,
  wouldExceedDailyLimit,
  UserAssignmentTime,
  isDateInUnavailablePeriods,
  generateRecurrenceDates,
  formatISODateOnly,
  parseSaoPauloDateTimeToUtc,
} from '@revezo/domain';
import { acquireUserLock, mapStatusForConflictCheck } from './helpers.js';

export interface CreateBatchProgramsParams {
  title: string;
  churchId?: string | null;
  departmentIds: string[];
  time?: string; // HH:MM
  recurrence: {
    mode: 'WEEKLY_DAYS' | 'DAILY_RANGE';
    startDate: string;
    endDate: string;
    weekdays?: number[];
  };
  slots: {
    title: string;
    departmentId: string;
    functionId?: string | null;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    requiredCount: number;
  }[];
  actorId: string;
  actorRole?: 'ADMIN_MASTER' | 'PASTOR' | 'ELDER' | 'USER' | null;
  ip?: string;
}

export async function createBatchProgramsWithAudit(params: CreateBatchProgramsParams) {
  const {
    title,
    churchId,
    departmentIds,
    time = '09:00',
    recurrence,
    slots,
    actorId,
    actorRole,
    ip,
  } = params;

  const dates = generateRecurrenceDates({
    mode: recurrence.mode,
    startDate: recurrence.startDate,
    endDate: recurrence.endDate,
    weekdays: recurrence.weekdays,
    maxOccurrences: 100,
  });

  if (dates.length === 0) {
    throw new Error('Nenhuma data válida encontrada no período informado.');
  }

  const recurrenceGroupId = randomUUID();

  return await prisma.$transaction(
    async (tx) => {
      const createdPrograms = [];

      for (const d of dates) {
        const dateStr = formatISODateOnly(d);
        const programDate = parseSaoPauloDateTimeToUtc(dateStr, time);

        const prog = await tx.program.create({
          data: {
            title,
            date: programDate,
            churchId: churchId || null,
            createdById: actorId,
            createdByRole: actorRole || null,
            recurrenceGroupId,
            departments: {
              create: departmentIds.map((deptId) => ({
                departmentId: deptId,
              })),
            },
            slots: {
              create: slots.map((s) => {
                const startsAt = parseSaoPauloDateTimeToUtc(dateStr, s.startTime || '09:00');
                const endsAt = parseSaoPauloDateTimeToUtc(dateStr, s.endTime || '10:00');

                return {
                  title: s.title,
                  departmentId: s.departmentId,
                  functionId: s.functionId || null,
                  startsAt,
                  endsAt,
                  requiredCount: s.requiredCount,
                };
              }),
            },
          },
          include: {
            slots: true,
          },
        });

        createdPrograms.push(prog);
      }

      const managers = await tx.departmentMember.findMany({
        where: {
          departmentId: { in: departmentIds },
          role: 'MANAGER',
        },
        include: {
          user: { select: { id: true, name: true, email: true, phonePrimary: true } },
          department: { select: { id: true, name: true } },
        },
      });

      for (const mgr of managers) {
        await tx.auditLog.create({
          data: {
            actorId,
            churchId: churchId || undefined,
            action: 'LEADER_BATCH_PROGRAM_NOTIFIED',
            targetType: 'Department',
            targetId: mgr.departmentId,
            result: 'SUCCESS',
            ip,
            meta: {
              leaderId: mgr.userId,
              leaderName: mgr.user.name,
              departmentName: mgr.department.name,
              recurrenceGroupId,
              programCount: createdPrograms.length,
              message: `Novos programas recorrentes (${title}) foram criados. Por favor, acesse o sistema para planejar as escalas da sua equipe.`,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          churchId: churchId || undefined,
          action: 'PROGRAM_BATCH_CREATED',
          targetType: 'Program',
          targetId: recurrenceGroupId,
          result: 'SUCCESS',
          ip,
          meta: {
            title,
            recurrenceGroupId,
            totalPrograms: createdPrograms.length,
            departmentCount: departmentIds.length,
            slotsPerProgram: slots.length,
            startDate: recurrence.startDate,
            endDate: recurrence.endDate,
          },
        },
      });

      return {
        success: true,
        recurrenceGroupId,
        createdCount: createdPrograms.length,
        programs: createdPrograms,
      };
    },
    { timeout: 30000 }
  );
}

export interface ApproveScheduleParams {
  assignmentIds: string[];
  actorId: string;
  ip?: string;
}

export async function approveScheduleAssignmentsWithAudit(params: ApproveScheduleParams) {
  const { assignmentIds, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const assignments = await tx.assignment.findMany({
      where: {
        id: { in: assignmentIds },
        status: 'PENDING_APPROVAL',
      },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
            function: true,
          },
        },
      },
    });

    if (assignments.length === 0) {
      throw new Error('Nenhuma escala pendente de aprovação encontrada.');
    }

    const updatedAssignments = [];

    for (const asg of assignments) {
      const updated = await tx.assignment.update({
        where: { id: asg.id },
        data: {
          status: 'PENDING',
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });

      updatedAssignments.push(updated);

      await tx.auditLog.create({
        data: {
          actorId,
          churchId: asg.slot.department.churchId || undefined,
          action: 'SCHEDULE_ASSIGNMENT_APPROVED',
          targetType: 'Assignment',
          targetId: asg.id,
          result: 'SUCCESS',
          ip,
          meta: {
            slotId: asg.slotId,
            userId: asg.userId,
            userName: asg.user.name,
            programTitle: asg.slot.program.title,
            departmentName: asg.slot.department.name,
          },
        },
      });
    }

    return {
      success: true,
      approvedCount: updatedAssignments.length,
      assignments: updatedAssignments,
    };
  });
}

export interface AdjustAndApproveScheduleParams {
  assignmentId: string;
  newUserId: string;
  actorId: string;
  ip?: string;
}

export async function adjustAndApproveScheduleAssignmentWithAudit(
  params: AdjustAndApproveScheduleParams
) {
  const { assignmentId, newUserId, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    await acquireUserLock(tx, newUserId);

    const assignment = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
            function: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new Error('Escala não encontrada.');
    }

    if (assignment.status !== 'PENDING_APPROVAL') {
      throw new Error('Apenas escalas pendentes de aprovação podem ser ajustadas neste fluxo.');
    }

    const newUser = await tx.user.findUnique({
      where: { id: newUserId },
      include: {
        availabilities: true,
        assignments: {
          where: {
            id: { not: assignmentId },
            status: { in: ['PENDING', 'CONFIRMED', 'PENDING_APPROVAL'] },
          },
          include: {
            slot: true,
          },
        },
      },
    });

    if (!newUser || newUser.status !== 'ACTIVE') {
      throw new Error('Novo voluntário não encontrado ou inativo.');
    }

    const slot = assignment.slot;
    if (
      slot.department.churchId &&
      newUser.churchId &&
      slot.department.churchId !== newUser.churchId
    ) {
      throw new Error('Não é possível escalar um voluntário vinculado a outra congregação.');
    }

    const unavailablePeriods = (newUser.availabilities || [])
      .filter((av) => av.kind === 'UNAVAILABLE_PERIOD' && av.from && av.to)
      .map((av) => ({ from: av.from!, to: av.to! }));

    if (isDateInUnavailablePeriods(slot.startsAt, slot.endsAt, unavailablePeriods)) {
      throw new Error(
        `Não foi possível escalar ${newUser.name}. Ela(e) registrou indisponibilidade para este período.`
      );
    }

    const activeAssignments: UserAssignmentTime[] = (newUser.assignments || []).map((a) => ({
      id: a.id,
      slotId: a.slotId,
      departmentId: a.slot.departmentId,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: mapStatusForConflictCheck(a.status),
    }));

    if (
      findConflictingAssignment(
        { startsAt: slot.startsAt, endsAt: slot.endsAt },
        activeAssignments
      )
    ) {
      throw new Error(
        `Não foi possível escalar ${newUser.name}. Ela(e) já tem uma escala nesse horário.`
      );
    }

    if (wouldExceedDailyLimit(slot.startsAt, activeAssignments)) {
      throw new Error(
        `Não foi possível escalar ${newUser.name}. Já são 2 escalas neste dia.`
      );
    }

    const updated = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        userId: newUserId,
        status: 'PENDING',
        approvedById: actorId,
        approvedAt: new Date(),
      },
      include: {
        user: true,
        slot: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        churchId: assignment.slot.department.churchId || undefined,
        action: 'SCHEDULE_ASSIGNMENT_ADJUSTED_AND_APPROVED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
        meta: {
          slotId: assignment.slotId,
          previousUserId: assignment.userId,
          newUserId,
          newUserName: newUser.name,
          programTitle: assignment.slot.program.title,
          departmentName: assignment.slot.department.name,
        },
      },
    });

    return updated;
  });
}

export interface RejectScheduleParams {
  assignmentIds: string[];
  reason?: string;
  actorId: string;
  ip?: string;
}

export async function rejectScheduleAssignmentsWithAudit(params: RejectScheduleParams) {
  const { assignmentIds, reason, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const assignments = await tx.assignment.findMany({
      where: {
        id: { in: assignmentIds },
        status: 'PENDING_APPROVAL',
      },
      include: {
        user: true,
        slot: {
          include: {
            program: true,
            department: true,
          },
        },
      },
    });

    if (assignments.length === 0) {
      throw new Error('Nenhuma escala pendente de aprovação encontrada.');
    }

    for (const asg of assignments) {
      await tx.assignment.delete({
        where: { id: asg.id },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          churchId: asg.slot.department.churchId || undefined,
          action: 'SCHEDULE_ASSIGNMENT_REJECTED',
          targetType: 'Assignment',
          targetId: asg.id,
          result: 'SUCCESS',
          ip,
          meta: {
            slotId: asg.slotId,
            userId: asg.userId,
            userName: asg.user.name,
            reason: reason || 'Rejeitado pelo gestor do departamento',
            programTitle: asg.slot.program.title,
            departmentName: asg.slot.department.name,
          },
        },
      });
    }

    return { success: true, rejectedCount: assignments.length };
  });
}

/**
 * Remove uma escala com segurança transacional, limpando eventuais pedidos de troca pendentes
 * (evitando violação de FK ON DELETE RESTRICT), reabrindo a vaga e registrando auditoria.
 */
export async function removeAssignmentWithAudit(params: {
  assignmentId: string;
  actorId: string;
  churchId?: string;
  ip?: string;
}) {
  const { assignmentId, actorId, churchId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!existing) {
      throw new Error('Escala não encontrada.');
    }

    if (
      typeof (tx as { swapRequest?: { deleteMany?: unknown } }).swapRequest?.deleteMany ===
      'function'
    ) {
      await tx.swapRequest.deleteMany({
        where: {
          OR: [{ assignmentId }, { targetAssignmentId: assignmentId }],
        },
      });
    }

    await tx.assignment.delete({
      where: { id: assignmentId },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        churchId,
        action: 'ASSIGNMENT_DELETED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
        meta: {
          slotId: existing.slotId,
          userId: existing.userId,
        },
      },
    });

    return { success: true };
  });
}
