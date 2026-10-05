import { prisma } from './client.js';

/**
 * Mascara números de telefone para logs/auditoria: +55 62 9****-1234
 */
export function maskPhoneForAudit(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '****';
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `+${prefix}****${suffix}`;
}

/**
 * Mascara e-mails para logs/auditoria: u****@dominio.com
 */
export function maskEmailForAudit(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '****';
  const user = parts[0];
  const domain = parts[1];
  const visible = user.slice(0, 1);
  return `${visible}****@${domain}`;
}

const FORBIDDEN_META_KEYS = new Set([
  'password',
  'rawpassword',
  'passwordhash',
  'hash',
  'token',
  'refreshtoken',
  'secret',
  'cookie',
  'sessiontoken',
  'authorization',
  'key',
  'encryptionkey',
]);

/**
 * Higieniza o objeto de metadados para garantir conformidade estrita com LGPD e Regra 19.
 * NUNCA armazena senhas, tokens completos ou PII em texto claro.
 */
export function sanitizeAuditMeta(meta: any): any {
  if (!meta || typeof meta !== 'object') {
    return meta;
  }

  if (Array.isArray(meta)) {
    return meta.map((item) => sanitizeAuditMeta(item));
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_META_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      if (lowerKey.includes('email')) {
        clean[key] = maskEmailForAudit(value);
      } else if (
        lowerKey.includes('phone') ||
        lowerKey.includes('telefone') ||
        lowerKey.includes('whatsapp')
      ) {
        clean[key] = maskPhoneForAudit(value);
      } else {
        clean[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditMeta(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
}

export interface RecordAuditParams {
  churchId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: 'SUCCESS' | 'DENIED' | 'FAILED';
  ip?: string | null;
  meta?: Record<string, any> | null;
}

/**
 * Função utilitária centralizada para criação de logs de auditoria
 * com higienização prévia de metadados e garantia de campos obrigatórios.
 */
export async function recordAudit(
  client: any,
  params: RecordAuditParams
) {
  const sanitizedMeta = params.meta ? sanitizeAuditMeta(params.meta) : undefined;
  return await client.auditLog.create({
    data: {
      churchId: params.churchId || undefined,
      actorId: params.actorId || undefined,
      action: params.action,
      targetType: params.targetType || undefined,
      targetId: params.targetId || undefined,
      result: params.result,
      ip: params.ip || undefined,
      meta: sanitizedMeta,
    },
  });
}

export interface QueryAuditLogsParams {
  churchId?: string;
  actorId?: string;
  searchUser?: string;
  action?: string;
  result?: 'SUCCESS' | 'DENIED' | 'FAILED';
  targetType?: string;
  targetId?: string;
  from?: string | Date;
  to?: string | Date;
  page?: number;
  limit?: number;
}

/**
 * Consulta estruturada de logs de auditoria com filtros compostos,
 * paginação e enriquecimento de dados de usuários e congregações.
 */
export async function queryAuditLogs(params: QueryAuditLogsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 50));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (params.churchId) {
    where.churchId = params.churchId;
  }

  if (params.action) {
    where.action = { contains: params.action };
  }

  if (params.result) {
    where.result = params.result;
  }

  if (params.targetType) {
    where.targetType = params.targetType;
  }

  if (params.targetId) {
    where.targetId = params.targetId;
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }

  if (params.actorId) {
    where.actorId = params.actorId;
  } else if (params.searchUser) {
    const matchedUsers = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: params.searchUser } },
          { email: { contains: params.searchUser } },
        ],
      },
      select: { id: true },
      take: 20,
    });
    const userIds = matchedUsers.map((u) => u.id);
    where.OR = [
      { actorId: { in: userIds } },
      { targetId: { in: userIds } },
    ];
  }

  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        church: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter(Boolean))) as string[];
  const targetUserIds = Array.from(
    new Set(
      logs
        .filter((l) => l.targetType === 'User' && l.targetId)
        .map((l) => l.targetId!)
    )
  );

  const allUserIds = Array.from(new Set([...actorIds, ...targetUserIds]));
  const users = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, name: true, email: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  const enrichedLogs = logs.map((log) => ({
    id: log.id,
    churchId: log.churchId,
    churchName: log.church?.name || null,
    actorId: log.actorId,
    actor: log.actorId ? userMap.get(log.actorId) || null : null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    targetUser:
      log.targetType === 'User' && log.targetId ? userMap.get(log.targetId) || null : null,
    result: log.result,
    ip: log.ip,
    meta: log.meta,
    createdAt: log.createdAt,
  }));

  return {
    items: enrichedLogs,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: skip + logs.length < totalCount,
    },
  };
}

export interface QueryScheduleHistoryParams {
  departmentId?: string;
  churchId?: string;
  programId?: string;
  userId?: string;
  eventType?: 'ALL' | 'ASSIGNED' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED' | 'SWAP';
  from?: string | Date;
  to?: string | Date;
  page?: number;
  limit?: number;
}

export interface ScheduleHistoryEvent {
  id: string;
  timestamp: Date;
  eventType: 'ASSIGNED' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED' | 'SWAP_REQUEST';
  actionLabel: string;
  actionCode: string;
  actor: {
    id: string | null;
    name: string;
    isSystem: boolean;
  };
  volunteer: {
    id: string;
    name: string;
    email: string;
  };
  substitute?: {
    id: string;
    name: string;
    email: string;
  } | null;
  slot: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    programTitle: string;
    departmentName: string;
    functionName?: string | null;
  };
  details: {
    reason?: string | null;
    notes?: string | null;
    status?: string | null;
  };
}

/**
 * Consulta e monta o Histórico Completo de Escalas (timeline):
 * "quem foi escalado, confirmou, recusou, foi substituído e por quem"
 */
export async function getScheduleHistory(params: QueryScheduleHistoryParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 50));
  const skip = (page - 1) * limit;

  const fromDate = params.from ? new Date(params.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const toDate = params.to ? new Date(params.to) : new Date();

  // Ações de auditoria relacionadas ao ciclo de vida da escala
  const scheduleActions = [
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_CONFIRMED',
    'ASSIGNMENT_CONFIRMED_VIA_TOKEN',
    'ASSIGNMENT_DECLINED',
    'ASSIGNMENT_DECLINED_VIA_TOKEN',
    'ASSIGNMENT_AUTO_SUBSTITUTED',
    'AUTO_SUBSTITUTION_ASSIGNED',
    'SWAP_REQUEST_CREATED',
    'SWAP_REQUEST_ACCEPTED_BY_TARGET',
    'SWAP_REQUEST_REJECTED_BY_TARGET',
    'SWAP_REQUEST_APPROVED',
    'SWAP_REQUEST_REJECTED_BY_MANAGER',
    'SWAP_REQUEST_CANCELLED',
    'SCHEDULE_ASSIGNMENT_APPROVED',
    'SCHEDULE_ASSIGNMENT_ADJUSTED_AND_APPROVED',
    'SCHEDULE_ASSIGNMENT_REJECTED',
  ];

  // Filtro de ação baseado em eventType
  let actionFilter: string[] = scheduleActions;
  if (params.eventType === 'ASSIGNED') {
    actionFilter = ['ASSIGNMENT_CREATED', 'SCHEDULE_ASSIGNMENT_APPROVED', 'SCHEDULE_ASSIGNMENT_ADJUSTED_AND_APPROVED'];
  } else if (params.eventType === 'CONFIRMED') {
    actionFilter = ['ASSIGNMENT_CONFIRMED', 'ASSIGNMENT_CONFIRMED_VIA_TOKEN'];
  } else if (params.eventType === 'DECLINED') {
    actionFilter = ['ASSIGNMENT_DECLINED', 'ASSIGNMENT_DECLINED_VIA_TOKEN', 'SCHEDULE_ASSIGNMENT_REJECTED'];
  } else if (params.eventType === 'SUBSTITUTED') {
    actionFilter = ['ASSIGNMENT_AUTO_SUBSTITUTED', 'AUTO_SUBSTITUTION_ASSIGNED', 'SWAP_REQUEST_APPROVED'];
  } else if (params.eventType === 'SWAP') {
    actionFilter = [
      'SWAP_REQUEST_CREATED',
      'SWAP_REQUEST_ACCEPTED_BY_TARGET',
      'SWAP_REQUEST_REJECTED_BY_TARGET',
      'SWAP_REQUEST_APPROVED',
      'SWAP_REQUEST_REJECTED_BY_MANAGER',
      'SWAP_REQUEST_CANCELLED',
    ];
  }

  // 1. Busca logs de auditoria correspondentes
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: { in: actionFilter },
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
      ...(params.churchId ? { churchId: params.churchId } : {}),
      ...(params.userId ? { OR: [{ actorId: params.userId }, { targetId: params.userId }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 300, // Amostra de histórico
  });

  // 2. Extrai IDs relevantes para resolução
  const assignmentIds = new Set<string>();
  const swapRequestIds = new Set<string>();
  const userIds = new Set<string>();

  for (const log of auditLogs) {
    if (log.actorId) userIds.add(log.actorId);
    if (log.targetType === 'Assignment' && log.targetId) {
      assignmentIds.add(log.targetId);
    } else if (log.targetType === 'SwapRequest' && log.targetId) {
      swapRequestIds.add(log.targetId);
    }

    const meta = (log.meta as Record<string, any>) || {};
    if (meta.userId) userIds.add(meta.userId);
    if (meta.newUserId) userIds.add(meta.newUserId);
    if (meta.candidateId) userIds.add(meta.candidateId);
    if (meta.originAssignmentId) assignmentIds.add(meta.originAssignmentId);
  }

  // 3. Resolve Assignments e SwapRequests com seus slots, departamentos e programas
  const [assignments, swapRequests, users] = await Promise.all([
    prisma.assignment.findMany({
      where: { id: { in: Array.from(assignmentIds) } },
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
    }),
    prisma.swapRequest.findMany({
      where: { id: { in: Array.from(swapRequestIds) } },
      include: {
        requester: true,
        targetUser: true,
        assignment: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
                function: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
  const swapMap = new Map(swapRequests.map((s) => [s.id, s]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  // 4. Monta os eventos estruturados
  const events: ScheduleHistoryEvent[] = [];

  for (const log of auditLogs) {
    const meta = (log.meta as Record<string, any>) || {};
    let assignment = log.targetType === 'Assignment' && log.targetId ? assignmentMap.get(log.targetId) : null;
    const swap = log.targetType === 'SwapRequest' && log.targetId ? swapMap.get(log.targetId) : null;

    if (!assignment && swap?.assignment) {
      assignment = swap.assignment as any;
    }
    if (!assignment && meta.originAssignmentId) {
      assignment = assignmentMap.get(meta.originAssignmentId) || null;
    }

    if (!assignment && !swap) {
      continue;
    }

    const slot = assignment?.slot || swap?.assignment?.slot;
    if (!slot) continue;

    // Filtros de departamento e programa
    if (params.departmentId && slot.departmentId !== params.departmentId) {
      continue;
    }
    if (params.programId && slot.programId !== params.programId) {
      continue;
    }

    const actorUser = log.actorId ? userMap.get(log.actorId) : null;
    const isSystemActor = !log.actorId || log.action.includes('AUTO_SUBSTITUTION');
    const actorName = actorUser ? actorUser.name : isSystemActor ? 'Sistema (Automático)' : 'Usuário';

    // Determina o voluntário principal do evento
    let volunteerUser = assignment?.user || swap?.requester;
    if (!volunteerUser && meta.userId) {
      volunteerUser = userMap.get(meta.userId) as any;
    }

    // Substituto (se for troca ou substituição automática)
    let substituteUser: { id: string; name: string; email: string } | null = null;
    if (meta.newUserId && userMap.has(meta.newUserId)) {
      substituteUser = userMap.get(meta.newUserId)!;
    } else if (swap?.targetUser) {
      substituteUser = swap.targetUser;
    }

    // Mapeia rótulo e tipo do evento
    let eventType: ScheduleHistoryEvent['eventType'] = 'ASSIGNED';
    let actionLabel = 'Escalado';

    switch (log.action) {
      case 'ASSIGNMENT_CREATED':
      case 'SCHEDULE_ASSIGNMENT_APPROVED':
        eventType = 'ASSIGNED';
        actionLabel = 'Escalado na vaga';
        break;
      case 'ASSIGNMENT_CONFIRMED':
      case 'ASSIGNMENT_CONFIRMED_VIA_TOKEN':
        eventType = 'CONFIRMED';
        actionLabel = 'Presença confirmada';
        break;
      case 'ASSIGNMENT_DECLINED':
      case 'ASSIGNMENT_DECLINED_VIA_TOKEN':
        eventType = 'DECLINED';
        actionLabel = 'Escala recusada';
        break;
      case 'ASSIGNMENT_AUTO_SUBSTITUTED':
      case 'AUTO_SUBSTITUTION_ASSIGNED':
        eventType = 'SUBSTITUTED';
        actionLabel = 'Substituído automaticamente';
        break;
      case 'SWAP_REQUEST_CREATED':
        eventType = 'SWAP_REQUEST';
        actionLabel = 'Solicitou troca de escala';
        break;
      case 'SWAP_REQUEST_ACCEPTED_BY_TARGET':
        eventType = 'SWAP_REQUEST';
        actionLabel = 'Substituto aceitou a troca';
        break;
      case 'SWAP_REQUEST_REJECTED_BY_TARGET':
        eventType = 'SWAP_REQUEST';
        actionLabel = 'Substituto recusou a troca';
        break;
      case 'SWAP_REQUEST_APPROVED':
        eventType = 'SUBSTITUTED';
        actionLabel = 'Troca aprovada pelo gestor';
        break;
      case 'SWAP_REQUEST_REJECTED_BY_MANAGER':
        eventType = 'SWAP_REQUEST';
        actionLabel = 'Troca recusada pelo gestor';
        break;
      case 'SWAP_REQUEST_CANCELLED':
        eventType = 'SWAP_REQUEST';
        actionLabel = 'Troca cancelada pelo solicitante';
        break;
      default:
        actionLabel = log.action;
    }

    if (!volunteerUser) continue;

    events.push({
      id: log.id,
      timestamp: log.createdAt,
      eventType,
      actionLabel,
      actionCode: log.action,
      actor: {
        id: log.actorId,
        name: actorName,
        isSystem: isSystemActor,
      },
      volunteer: {
        id: volunteerUser.id,
        name: volunteerUser.name,
        email: volunteerUser.email,
      },
      substitute: substituteUser,
      slot: {
        id: slot.id,
        title: slot.title,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        programTitle: slot.program.title,
        departmentName: slot.department.name,
        functionName: slot.function?.name || null,
      },
      details: {
        reason: meta.reason || swap?.reason || assignment?.declinedReason || null,
        notes: meta.notes || swap?.managerNotes || null,
        status: log.result,
      },
    });
  }

  // Paginação sobre os eventos ordenados cronologicamente (mais recente primeiro)
  const paginatedEvents = events.slice(skip, skip + limit);

  return {
    events: paginatedEvents,
    pagination: {
      page,
      limit,
      totalCount: events.length,
      totalPages: Math.ceil(events.length / limit),
      hasMore: skip + paginatedEvents.length < events.length,
    },
  };
}
