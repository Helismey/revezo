import { Prisma } from '@prisma/client';
import {
  CandidateUser,
  SlotRequirement,
  findBestSubstituteCandidate,
  validateSwapProposal,
} from '@revezo/domain';

/**
 * Adquire lock transacional por usuário no PostgreSQL para serializar atribuições concorrentes.
 * Ignora silenciosamente em ambientes de teste unitário com mocks parciais que não expõem $executeRaw.
 */
export async function acquireUserLock(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  if (typeof (tx as { $executeRaw?: unknown }).$executeRaw === 'function') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  }
}

/**
 * Normaliza o status do banco para verificação de conflito e limite diário no domínio
 * (tratando PENDING_APPROVAL como escala ativa).
 */
export function mapStatusForConflictCheck(
  status: string
): 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED' {
  if (status === 'PENDING_APPROVAL') return 'PENDING';
  return status as 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED';
}

/**
 * Helper interno unificado para busca e atribuição de substituto elegível dentro de uma transação.
 */
export async function findAndAssignSubstituteInternal(
  tx: Prisma.TransactionClient,
  params: {
    slot: {
      id: string;
      departmentId: string;
      functionId: string | null;
      startsAt: Date;
      endsAt: Date;
      department: { churchId: string | null; name: string };
      program: { title: string };
    };
    originalAssignmentId: string;
    originalUserId: string;
    declinedReason?: string | null;
    actorId?: string;
    ip?: string;
    auditAction?: string;
    auditReasonMeta?: string;
  }
) {
  const {
    slot,
    originalAssignmentId,
    originalUserId,
    declinedReason,
    actorId,
    ip,
    auditAction = 'AUTO_SUBSTITUTION_ASSIGNED',
    auditReasonMeta,
  } = params;

  const now = new Date();

  const previousDeclined = await tx.assignment.findMany({
    where: {
      slotId: slot.id,
      status: { in: ['DECLINED', 'SUBSTITUTED'] },
    },
    select: { userId: true },
  });
  const declinedUserIds = Array.from(
    new Set([originalUserId, ...previousDeclined.map((p) => p.userId)])
  );

  const members = await tx.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(slot.department.churchId ? { churchId: slot.department.churchId } : {}),
      memberships: {
        some: {
          departmentId: slot.departmentId,
          ...(slot.functionId ? { functions: { some: { functionId: slot.functionId } } } : {}),
        },
      },
    },
    include: {
      memberships: {
        include: {
          functions: true,
        },
      },
      availabilities: true,
      assignments: {
        where: {
          status: { in: ['PENDING', 'CONFIRMED', 'PENDING_APPROVAL'] },
        },
        include: {
          slot: {
            include: {
              program: true,
              department: true,
            },
          },
        },
      },
    },
  });

  const candidates: CandidateUser[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    departmentMemberships: m.memberships.map((mem) => ({
      departmentId: mem.departmentId,
      functions: mem.functions.map((f) => ({ functionId: f.functionId })),
    })),
    availabilities: m.availabilities.map((av) => ({
      kind: av.kind,
      weekday: av.weekday,
      from: av.from,
      to: av.to,
    })),
    assignments: m.assignments.map((a) => ({
      id: a.id,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: mapStatusForConflictCheck(a.status),
      departmentName: a.slot.department.name,
      programTitle: a.slot.program.title,
    })),
  }));

  const memberIds = members.map((m) => m.id);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const recentAssignments =
    memberIds.length > 0
      ? await tx.assignment.findMany({
          where: {
            userId: { in: memberIds },
            status: { in: ['CONFIRMED', 'PENDING', 'PENDING_APPROVAL'] },
            slot: {
              startsAt: { gte: sixtyDaysAgo, lte: now },
            },
          },
          select: {
            userId: true,
            createdAt: true,
            slot: {
              select: { startsAt: true },
            },
          },
        })
      : [];

  const statsMap = new Map<
    string,
    { assignmentsLast60Days: number; lastAssignmentDate?: Date | null }
  >();
  for (const m of members) {
    const userAssignments = recentAssignments.filter((a) => a.userId === m.id);
    const count = userAssignments.length;
    let lastDate: Date | null = null;
    if (userAssignments.length > 0) {
      const sorted = [...userAssignments].sort((a, b) => {
        const aTime = a.slot?.startsAt ? a.slot.startsAt.getTime() : a.createdAt.getTime();
        const bTime = b.slot?.startsAt ? b.slot.startsAt.getTime() : b.createdAt.getTime();
        return bTime - aTime;
      });
      lastDate = sorted[0]?.slot?.startsAt ?? sorted[0]?.createdAt ?? null;
    }
    statsMap.set(m.id, { assignmentsLast60Days: count, lastAssignmentDate: lastDate });
  }

  const slotReq: SlotRequirement = {
    id: slot.id,
    departmentId: slot.departmentId,
    functionId: slot.functionId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  };

  const subResult = findBestSubstituteCandidate({
    candidates,
    slot: slotReq,
    declinedUserIds,
    statsMap,
  });

  if (!subResult.candidate) {
    return {
      newAssignment: null,
      diagnosis: subResult.diagnosis,
    };
  }

  await acquireUserLock(tx, subResult.candidate.id);

  // Atualiza a escala original para SUBSTITUTED
  await tx.assignment.update({
    where: { id: originalAssignmentId },
    data: {
      status: 'SUBSTITUTED',
      ...(declinedReason !== undefined ? { declinedReason } : {}),
    },
  });

  const newAssignment = await tx.assignment.create({
    data: {
      slotId: slot.id,
      userId: subResult.candidate.id,
      status: 'PENDING',
      replacedById: originalAssignmentId,
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

  await tx.auditLog.create({
    data: {
      actorId: actorId || 'SYSTEM_AUTO_SUB',
      churchId: slot.department.churchId || undefined,
      action: auditAction,
      targetType: 'Assignment',
      targetId: newAssignment.id,
      result: 'SUCCESS',
      ip,
      meta: {
        ...(auditReasonMeta ? { reason: auditReasonMeta } : {}),
        originalAssignmentId,
        originalUserId,
        substituteUserId: newAssignment.userId,
        slotId: slot.id,
        programTitle: slot.program.title,
      },
    },
  });

  return {
    newAssignment,
    diagnosis: undefined,
  };
}

/**
 * Helper interno para carregar e validar elegibilidade de candidato a troca.
 */
export async function validateSwapTargetCandidateInTx(
  tx: Prisma.TransactionClient,
  params: {
    requesterId: string;
    targetUserId: string;
    originSlot: {
      id: string;
      departmentId: string;
      functionId: string | null;
      startsAt: Date;
      endsAt: Date;
      department: { churchId: string | null };
    };
    excludeAssignmentId?: string | null;
  }
) {
  const { requesterId, targetUserId, originSlot, excludeAssignmentId } = params;

  const target = await tx.user.findUnique({
    where: { id: targetUserId },
    include: {
      memberships: {
        include: { functions: true },
      },
      availabilities: true,
      assignments: {
        where: {
          status: { in: ['PENDING', 'CONFIRMED', 'PENDING_APPROVAL'] },
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
        include: {
          slot: {
            include: { program: true, department: true },
          },
        },
      },
    },
  });

  if (!target || target.status !== 'ACTIVE') {
    throw new Error('Voluntário indicado não foi encontrado ou não está ativo.');
  }

  if (
    originSlot.department.churchId &&
    target.churchId &&
    originSlot.department.churchId !== target.churchId
  ) {
    throw new Error('O voluntário indicado pertence a outra congregação.');
  }

  const targetCandidate: CandidateUser = {
    id: target.id,
    name: target.name,
    status: target.status,
    departmentMemberships: target.memberships.map((m) => ({
      departmentId: m.departmentId,
      functions: m.functions.map((f) => ({ functionId: f.functionId })),
    })),
    availabilities: target.availabilities.map((av) => ({
      kind: av.kind,
      weekday: av.weekday,
      from: av.from,
      to: av.to,
    })),
    assignments: target.assignments.map((a) => ({
      id: a.id,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: mapStatusForConflictCheck(a.status),
      departmentName: a.slot.department.name,
      programTitle: a.slot.program.title,
    })),
  };

  const slotReq: SlotRequirement = {
    id: originSlot.id,
    departmentId: originSlot.departmentId,
    functionId: originSlot.functionId,
    startsAt: originSlot.startsAt,
    endsAt: originSlot.endsAt,
  };

  const val = validateSwapProposal({
    requesterId,
    targetCandidate,
    originSlot: slotReq,
  });

  if (!val.valid) {
    throw new Error(val.error || 'Voluntário indicado não está apto para esta escala.');
  }
}
