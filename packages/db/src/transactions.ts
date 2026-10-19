import { randomBytes } from 'crypto';
import { prisma } from './client.js';
import { Prisma } from '@prisma/client';
import {
  findConflictingAssignment,
  wouldExceedDailyLimit,
  UserAssignmentTime,
  validateProfileDates,
  isDateInUnavailablePeriods,
  matchesPreferredWeekdays,
  validateUnavailablePeriod,
  formatWeekdayPtBr,
  getWeekdayInTimezone,
  generateActionToken,
  hashActionToken,
  isActionTokenValid,
  calculateTokenExpiration,
  formatConfirmationMessage,
  validatePasswordPolicy,
  hashPassword,
  verifyPassword,
  checkEligibility,
  rankCandidates,
  CandidateUser,
  SlotRequirement,
  generateProgramSchedule,
  AutoScheduleSlotInput,
  CandidateWithHistory,
  canRespondSwap,
  canCancelSwap,
  generateRefreshTokenPair,
  hashRefreshToken,
  evaluateRefreshToken,
  encryptSensitiveJson,
  encryptEmergencyContact,
  encryptOptionalString,
} from '@revezo/domain';
import {
  acquireUserLock,
  mapStatusForConflictCheck,
  findAndAssignSubstituteInternal,
  validateSwapTargetCandidateInTx,
} from './transactions/helpers.js';

export * from './transactions/churches.js';
export * from './transactions/programs.js';

export interface AssignMemberParams {
  slotId: string;
  userId: string;
  actorId?: string;
  ip?: string;
}

export async function assignMemberWithLock(params: AssignMemberParams) {
  const { slotId, userId, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    await acquireUserLock(tx, userId);

    // 1. Busca os detalhes do slot
    const slot = await tx.programSlot.findUnique({
      where: { id: slotId },
      include: {
        department: true,
        function: true,
      },
    });

    if (!slot) {
      throw new Error('Slot da escala não encontrado');
    }

    // 2. Busca dados do usuário
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        assignments: {
          include: {
            slot: true,
          },
        },
        availabilities: true,
      },
    });

    if (!user) {
      throw new Error('Voluntário não encontrado');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error(`Voluntário não está ativo (status atual: ${user.status})`);
    }

    // 2.1. Verificação de congregação (anti-IDOR e isolamento de igrejas)
    if (slot.department.churchId && user.churchId && slot.department.churchId !== user.churchId) {
      throw new Error('Não é possível escalar um voluntário vinculado a outra congregação.');
    }

    // 3. Verificação de períodos de indisponibilidade
    const unavailablePeriods = user.availabilities
      .filter((av) => av.kind === 'UNAVAILABLE_PERIOD' && av.from && av.to)
      .map((av) => ({ from: av.from!, to: av.to! }));

    if (isDateInUnavailablePeriods(slot.startsAt, slot.endsAt, unavailablePeriods)) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_ATTEMPT_FAILED',
          targetType: 'ProgramSlot',
          targetId: slotId,
          result: 'DENIED',
          ip,
          meta: { reason: 'INDISPONIBILIDADE_VOLUNTARIO', userId },
        },
      });

      throw new Error(
        `Não foi possível escalar ${user.name}. Ela(e) registrou indisponibilidade para este período. Escolha outra pessoa.`
      );
    }

    // 4. Verificação de preferências de dias da semana
    const preferredDays = user.availabilities
      .filter((av) => av.kind === 'PREFERRED_WEEKDAY' && typeof av.weekday === 'number')
      .map((av) => av.weekday as number);

    if (!matchesPreferredWeekdays(slot.startsAt, preferredDays)) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_ATTEMPT_FAILED',
          targetType: 'ProgramSlot',
          targetId: slotId,
          result: 'DENIED',
          ip,
          meta: { reason: 'PREFERENCIA_DIA_NAO_ATENDIDA', userId },
        },
      });

      const dayName = formatWeekdayPtBr(getWeekdayInTimezone(slot.startsAt));
      throw new Error(
        `Não foi possível escalar ${user.name}. O dia da escala (${dayName}) não está entre os dias preferidos de serviço cadastrados por ela(e).`
      );
    }

    // 5. Monta a lista de escalas ativas para validação pelas regras puras de domínio
    const activeAssignments: UserAssignmentTime[] = user.assignments.map((a) => ({
      id: a.id,
      slotId: a.slotId,
      departmentId: a.slot.departmentId,
      startsAt: a.slot.startsAt,
      endsAt: a.slot.endsAt,
      status: mapStatusForConflictCheck(a.status),
    }));

    // 6. Verificação de conflito de horário
    const conflict = findConflictingAssignment(
      { startsAt: slot.startsAt, endsAt: slot.endsAt },
      activeAssignments
    );

    if (conflict) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_ATTEMPT_FAILED',
          targetType: 'ProgramSlot',
          targetId: slotId,
          result: 'DENIED',
          ip,
          meta: { reason: 'CONFLITO_HORARIO', userId },
        },
      });

      throw new Error(
        `Não foi possível escalar ${user.name}. Ela(e) já tem uma escala nesse horário. Escolha outra pessoa ou ajuste o horário.`
      );
    }

    // 5. Verificação do limite de 2 escalas por dia
    if (wouldExceedDailyLimit(slot.startsAt, activeAssignments)) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_ATTEMPT_FAILED',
          targetType: 'ProgramSlot',
          targetId: slotId,
          result: 'DENIED',
          ip,
          meta: { reason: 'LIMITE_DIARIO_EXCEDIDO', userId },
        },
      });

      throw new Error(
        `Não foi possível escalar ${user.name}. Já são 2 escalas neste dia. Escolha outra pessoa.`
      );
    }

    // 6. Criação do Assignment
    const newAssignment = await tx.assignment.create({
      data: {
        slotId,
        userId,
        status: 'PENDING',
      },
    });

    // 7. Registro de auditoria somente-inserção
    await tx.auditLog.create({
      data: {
        actorId,
        churchId: slot.department.churchId || undefined,
        action: 'ASSIGNMENT_CREATED',
        targetType: 'Assignment',
        targetId: newAssignment.id,
        result: 'SUCCESS',
        ip,
        meta: {
          slotId,
          userId,
          slotTitle: slot.title,
          departmentId: slot.departmentId,
        },
      },
    });

    return newAssignment;
  });
}

export interface DeclineAssignmentParams {
  assignmentId: string;
  reason?: string;
  actorId?: string;
  ip?: string;
}

export async function declineAssignmentWithAudit(params: DeclineAssignmentParams) {
  const { assignmentId, reason, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!existing) {
      throw new Error('Escala não encontrada.');
    }

    if (actorId && existing.userId !== actorId) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_DECLINE_DENIED',
          targetType: 'Assignment',
          targetId: assignmentId,
          result: 'DENIED',
          ip,
          meta: { reason: 'IDOR_ATTEMPT', ownerUserId: existing.userId },
        },
      });
      throw new Error('Operação negada: você só pode desmarcar escalas atribuídas a você.');
    }

    const updated = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'DECLINED',
        declinedReason: reason,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || existing.userId,
        action: 'ASSIGNMENT_DECLINED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
        meta: { reason },
      },
    });

    return updated;
  });
}

export interface ConfirmAssignmentParams {
  assignmentId: string;
  actorId?: string;
  ip?: string;
}

export async function confirmAssignmentWithAudit(params: ConfirmAssignmentParams) {
  const { assignmentId, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!existing) {
      throw new Error('Escala não encontrada.');
    }

    if (actorId && existing.userId !== actorId) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'ASSIGNMENT_CONFIRM_DENIED',
          targetType: 'Assignment',
          targetId: assignmentId,
          result: 'DENIED',
          ip,
          meta: { reason: 'IDOR_ATTEMPT', ownerUserId: existing.userId },
        },
      });
      throw new Error('Operação negada: você só pode confirmar escalas atribuídas a você.');
    }

    const updated = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'CONFIRMED',
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || existing.userId,
        action: 'ASSIGNMENT_CONFIRMED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
      },
    });

    return updated;
  });
}

export interface UpdateUserProfileParams {
  userId: string;
  data: {
    name?: string;
    photoUrl?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    maritalStatus?: string | null;
    phonePrimary?: string;
    phoneSecondary?: string | null;
    whatsapp?: string | null;
    address?: Record<string, unknown> | null;
    emergencyContact?: { name: string; phone: string; relationship: string } | null;
    joinedAt?: string | null;
    preferredChannel?: 'WHATSAPP' | 'EMAIL' | 'PUSH' | 'SMS';
    notes?: string | null;
    optOutWhatsapp?: boolean;
    optOutEmail?: boolean;
    optOutPush?: boolean;
    optOutSms?: boolean;
  };
  actorId?: string;
  ip?: string;
}

export async function updateUserProfileWithAudit(params: UpdateUserProfileParams) {
  const { userId, data, actorId, ip } = params;

  // Validação de datas pelo domínio
  const dateCheck = validateProfileDates(data.birthDate, data.joinedAt);
  if (!dateCheck.valid) {
    throw new Error(dateCheck.error || 'Datas de perfil inconsistentes.');
  }

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || null;

  return await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new Error('Usuário não encontrado.');
    }

    if (existingUser.status !== 'ACTIVE') {
      throw new Error('Apenas usuários ativos podem atualizar seu perfil.');
    }

    const encryptedAddress =
      data.address !== undefined
        ? data.address
          ? (encryptSensitiveJson(data.address, encryptionKey) as Prisma.InputJsonValue)
          : Prisma.JsonNull
        : undefined;

    const encryptedEmergencyContact =
      data.emergencyContact !== undefined
        ? data.emergencyContact
          ? (encryptEmergencyContact(data.emergencyContact, encryptionKey) as Prisma.InputJsonValue)
          : Prisma.JsonNull
        : undefined;

    const encryptedNotes =
      data.notes !== undefined ? encryptOptionalString(data.notes, encryptionKey) : undefined;

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl || null }),
        ...(data.birthDate !== undefined && {
          birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null,
        }),
        ...(data.gender !== undefined && { gender: data.gender || null }),
        ...(data.maritalStatus !== undefined && { maritalStatus: data.maritalStatus || null }),
        ...(data.phonePrimary !== undefined && { phonePrimary: data.phonePrimary }),
        ...(data.phoneSecondary !== undefined && { phoneSecondary: data.phoneSecondary || null }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp || null }),
        ...(encryptedAddress !== undefined && { address: encryptedAddress }),
        ...(encryptedEmergencyContact !== undefined && {
          emergencyContact: encryptedEmergencyContact,
        }),
        ...(data.joinedAt !== undefined && {
          joinedAt: data.joinedAt ? new Date(`${data.joinedAt}T00:00:00Z`) : null,
        }),
        ...(data.preferredChannel !== undefined && { preferredChannel: data.preferredChannel }),
        ...(encryptedNotes !== undefined && { notes: encryptedNotes }),
        ...(data.optOutWhatsapp !== undefined && { optOutWhatsapp: data.optOutWhatsapp }),
        ...(data.optOutEmail !== undefined && { optOutEmail: data.optOutEmail }),
        ...(data.optOutPush !== undefined && { optOutPush: data.optOutPush }),
        ...(data.optOutSms !== undefined && { optOutSms: data.optOutSms }),
      },
    });

    // LGPD & Trilha de Auditoria: registrar apenas as chaves alteradas, sem dados pessoais em texto claro
    const updatedFields = Object.keys(data).filter(
      (k) => (data as Record<string, unknown>)[k] !== undefined
    );

    await tx.auditLog.create({
      data: {
        actorId: actorId || userId,
        action: 'USER_PROFILE_UPDATED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        ip,
        meta: {
          camposAtualizados: updatedFields,
        },
      },
    });

    return updated;
  });
}

export interface SetPreferredWeekdaysParams {
  userId: string;
  weekdays: number[];
  actorId?: string;
  ip?: string;
}

export async function setPreferredWeekdaysWithAudit(params: SetPreferredWeekdaysParams) {
  const { userId, weekdays, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Remove preferências anteriores do tipo PREFERRED_WEEKDAY
    await tx.availability.deleteMany({
      where: {
        userId,
        kind: 'PREFERRED_WEEKDAY',
      },
    });

    // 2. Insere as novas preferências
    if (weekdays.length > 0) {
      await tx.availability.createMany({
        data: weekdays.map((w) => ({
          userId,
          kind: 'PREFERRED_WEEKDAY',
          weekday: w,
        })),
      });
    }

    // 3. Trilha de auditoria somente-inserção
    await tx.auditLog.create({
      data: {
        actorId: actorId || userId,
        action: 'AVAILABILITY_PREFERENCES_UPDATED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        ip,
        meta: {
          preferredWeekdays: weekdays,
        },
      },
    });

    return { success: true, count: weekdays.length };
  });
}

export interface AddUnavailablePeriodParams {
  userId: string;
  from: string | Date;
  to: string | Date;
  actorId?: string;
  ip?: string;
}

export async function addUnavailablePeriodWithAudit(params: AddUnavailablePeriodParams) {
  const { userId, from, to, actorId, ip } = params;

  const validation = validateUnavailablePeriod(from, to);
  if (!validation.valid) {
    throw new Error(validation.error || 'Período de indisponibilidade inválido.');
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  return await prisma.$transaction(async (tx) => {
    const created = await tx.availability.create({
      data: {
        userId,
        kind: 'UNAVAILABLE_PERIOD',
        from: fromDate,
        to: toDate,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || userId,
        action: 'UNAVAILABLE_PERIOD_ADDED',
        targetType: 'Availability',
        targetId: created.id,
        result: 'SUCCESS',
        ip,
        meta: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      },
    });

    return created;
  });
}

export interface RemoveUnavailablePeriodParams {
  userId: string;
  availabilityId: string;
  actorId?: string;
  ip?: string;
}

export async function removeUnavailablePeriodWithAudit(params: RemoveUnavailablePeriodParams) {
  const { userId, availabilityId, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.availability.findUnique({
      where: { id: availabilityId },
    });

    if (!existing || existing.userId !== userId || existing.kind !== 'UNAVAILABLE_PERIOD') {
      throw new Error('Período de indisponibilidade não encontrado.');
    }

    await tx.availability.delete({
      where: { id: availabilityId },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || userId,
        action: 'UNAVAILABLE_PERIOD_REMOVED',
        targetType: 'Availability',
        targetId: availabilityId,
        result: 'SUCCESS',
        ip,
      },
    });

    return { success: true };
  });
}

export interface CreateConfirmationTokenParams {
  assignmentId: string;
  actorId?: string;
  ip?: string;
  maxDays?: number;
  baseUrl?: string;
  churchName?: string;
}

export interface ConfirmationTokenResult {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
  assignmentId: string;
  confirmationUrl: string;
  whatsappMessage: string;
  member: {
    id: string;
    name: string;
    phonePrimary: string | null;
  };
}

export async function createConfirmationTokenWithAudit(
  params: CreateConfirmationTokenParams
): Promise<ConfirmationTokenResult> {
  const { assignmentId, actorId, ip, maxDays = 7, baseUrl = '', churchName } = params;

  // 1. Busca dados da escala, voluntário e slot
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: true,
      slot: {
        include: {
          department: true,
          function: true,
          program: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new Error('Escala não encontrada.');
  }

  if (assignment.user.status !== 'ACTIVE') {
    throw new Error(`Voluntário não está ativo (status atual: ${assignment.user.status}).`);
  }

  // 2. Calcula expiração com base no início da escala e limite máximo
  const expiresAt = calculateTokenExpiration(assignment.slot.startsAt, maxDays);
  const { rawToken, tokenHash } = generateActionToken();

  // 3. Persistência transacional com auditoria e revogação de tokens anteriores não usados
  await prisma.$transaction(async (tx) => {
    // Revoga tokens anteriores não utilizados para a mesma escala
    await tx.actionToken.deleteMany({
      where: {
        userId: assignment.userId,
        purpose: 'CONFIRM_ASSIGNMENT',
        refId: assignmentId,
        usedAt: null,
      },
    });

    // Insere o novo token
    await tx.actionToken.create({
      data: {
        userId: assignment.userId,
        purpose: 'CONFIRM_ASSIGNMENT',
        refId: assignmentId,
        tokenHash,
        expiresAt,
      },
    });

    // Trilha de auditoria
    await tx.auditLog.create({
      data: {
        actorId: actorId || assignment.userId,
        action: 'CONFIRMATION_TOKEN_CREATED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
        meta: {
          userId: assignment.userId,
          slotId: assignment.slotId,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });

  const confirmationUrl = baseUrl ? `${baseUrl}/confirmar/${rawToken}` : `/confirmar/${rawToken}`;
  const resolvedChurchName =
    churchName !== undefined
      ? churchName
      : (await prisma.churchSettings.findFirst())?.name;

  const whatsappMessage = formatConfirmationMessage({
    memberFirstName: assignment.user.name.split(' ')[0] || assignment.user.name,
    churchName: resolvedChurchName,
    programTitle: assignment.slot.program.title,
    departmentName: assignment.slot.department.name,
    functionName: assignment.slot.function?.name || assignment.slot.title,
    startsAt: assignment.slot.startsAt,
    confirmationUrl,
  });

  return {
    rawToken,
    tokenHash,
    expiresAt,
    assignmentId,
    confirmationUrl,
    whatsappMessage,
    member: {
      id: assignment.user.id,
      name: assignment.user.name,
      phonePrimary: assignment.user.phonePrimary,
    },
  };
}

export interface VerifyConfirmationTokenResult {
  valid: boolean;
  error?: 'TOKEN_NOT_FOUND' | 'ALREADY_USED' | 'EXPIRED' | 'ASSIGNMENT_NOT_FOUND';
  message?: string;
  data?: {
    token: string;
    assignmentId: string;
    status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED';
    declinedReason: string | null;
    memberFirstName: string;
    memberFullName: string;
    programTitle: string;
    departmentName: string;
    functionName: string;
    startsAt: string;
    endsAt: string;
    expiresAt: string;
  };
}

export async function verifyConfirmationToken(rawToken: string): Promise<VerifyConfirmationTokenResult> {
  const tokenHash = hashActionToken(rawToken);

  const actionToken = await prisma.actionToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!actionToken || actionToken.purpose !== 'CONFIRM_ASSIGNMENT' || !actionToken.refId) {
    return {
      valid: false,
      error: 'TOKEN_NOT_FOUND',
      message: 'Link de confirmação inválido ou não encontrado.',
    };
  }

  const statusCheck = isActionTokenValid({
    usedAt: actionToken.usedAt,
    expiresAt: actionToken.expiresAt,
  });

  if (!statusCheck.valid) {
    if (statusCheck.reason === 'ALREADY_USED') {
      return {
        valid: false,
        error: 'ALREADY_USED',
        message: 'Este link de confirmação já foi utilizado anteriormente.',
      };
    }
    return {
      valid: false,
      error: 'EXPIRED',
      message: 'Este link de confirmação expirou.',
    };
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: actionToken.refId },
    include: {
      slot: {
        include: {
          department: true,
          function: true,
          program: true,
        },
      },
    },
  });

  if (!assignment) {
    return {
      valid: false,
      error: 'ASSIGNMENT_NOT_FOUND',
      message: 'A escala associada a este link não foi encontrada.',
    };
  }

  return {
    valid: true,
    data: {
      token: rawToken,
      assignmentId: assignment.id,
      status: assignment.status as 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED',
      declinedReason: assignment.declinedReason,
      memberFirstName: actionToken.user.name.split(' ')[0] || actionToken.user.name,
      memberFullName: actionToken.user.name,
      programTitle: assignment.slot.program.title,
      departmentName: assignment.slot.department.name,
      functionName: assignment.slot.function?.name || assignment.slot.title,
      startsAt: assignment.slot.startsAt.toISOString(),
      endsAt: assignment.slot.endsAt.toISOString(),
      expiresAt: actionToken.expiresAt.toISOString(),
    },
  };
}

export interface ConsumeConfirmationTokenParams {
  rawToken: string;
  action: 'CONFIRM' | 'DECLINE';
  reason?: string;
  ip?: string;
}

export async function consumeConfirmationTokenWithAudit(params: ConsumeConfirmationTokenParams) {
  const { rawToken, action, reason, ip } = params;
  const tokenHash = hashActionToken(rawToken);

  return await prisma.$transaction(async (tx) => {
    const actionToken = await tx.actionToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!actionToken || actionToken.purpose !== 'CONFIRM_ASSIGNMENT' || !actionToken.refId) {
      await tx.auditLog.create({
        data: {
          action: 'CONFIRMATION_TOKEN_CONSUME_FAILED',
          result: 'DENIED',
          ip,
          meta: { reason: 'TOKEN_INVALIDO' },
        },
      });
      throw new Error('Link de confirmação inválido ou não encontrado.');
    }

    const check = isActionTokenValid({
      usedAt: actionToken.usedAt,
      expiresAt: actionToken.expiresAt,
    });

    if (!check.valid) {
      await tx.auditLog.create({
        data: {
          actorId: actionToken.userId,
          action: 'CONFIRMATION_TOKEN_CONSUME_FAILED',
          result: 'DENIED',
          ip,
          meta: { reason: check.reason, actionTokenId: actionToken.id },
        },
      });

      if (check.reason === 'ALREADY_USED') {
        throw new Error('Este link de confirmação já foi utilizado.');
      }
      throw new Error('Este link de confirmação expirou.');
    }

    // Marca o token como consumido
    await tx.actionToken.update({
      where: { id: actionToken.id },
      data: {
        usedAt: new Date(),
      },
    });

    const resolvedReason =
      action === 'DECLINE' ? reason || 'Imprevisto informado pelo voluntário via link' : null;

    // Atualiza o assignment
    const targetStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED';
    const updatedAssignment = await tx.assignment.update({
      where: { id: actionToken.refId },
      data: {
        status: targetStatus,
        declinedReason: resolvedReason,
      },
      include: {
        slot: {
          include: {
            department: true,
            program: true,
          },
        },
      },
    });

    // Auditoria
    await tx.auditLog.create({
      data: {
        actorId: actionToken.userId,
        action: action === 'CONFIRM' ? 'ASSIGNMENT_CONFIRMED_VIA_TOKEN' : 'ASSIGNMENT_DECLINED_VIA_TOKEN',
        targetType: 'Assignment',
        targetId: actionToken.refId,
        result: 'SUCCESS',
        ip,
        meta: {
          actionTokenId: actionToken.id,
          reason: action === 'DECLINE' ? reason : undefined,
          programTitle: updatedAssignment.slot.program.title,
          departmentName: updatedAssignment.slot.department.name,
        },
      },
    });

    // Se o voluntário desmarcou e a flag auto_substitution estiver ativa, tenta substituição imediata
    let substituteAssignmentId: string | null = null;
    let diagnosis: string | undefined;
    if (action === 'DECLINE') {
      const autoSubFlag = await tx.featureFlag.findUnique({
        where: { key: 'auto_substitution' },
      });

      if (autoSubFlag?.enabled) {
        const subOutcome = await findAndAssignSubstituteInternal(tx, {
          slot: updatedAssignment.slot,
          originalAssignmentId: updatedAssignment.id,
          originalUserId: actionToken.userId,
          declinedReason: resolvedReason,
          actorId: 'SYSTEM_AUTO_SUB',
          ip,
        });
        if (subOutcome.newAssignment) {
          substituteAssignmentId = subOutcome.newAssignment.id;
        } else {
          diagnosis = subOutcome.diagnosis;
        }
      }
    }

    return {
      success: true,
      action,
      assignmentId: updatedAssignment.id,
      status: substituteAssignmentId ? 'SUBSTITUTED' : updatedAssignment.status,
      memberFirstName: actionToken.user.name.split(' ')[0] || actionToken.user.name,
      substituteAssignmentId,
      diagnosis,
    };
  });
}

// ---- Recuperação de Senha Segura (ActionToken) ----

export interface RequestPasswordResetParams {
  email: string;
  ip?: string;
  userAgent?: string;
}

export interface RequestPasswordResetResult {
  success: boolean;
  userFound: boolean;
  rawToken?: string;
  expiresAt?: Date;
}

/**
 * Solicita redefinição de senha com token descartável e hash em banco.
 * Proteção contra enumeração: a resposta para a API externa é idêntica.
 */
export async function requestPasswordResetToken(
  params: RequestPasswordResetParams
): Promise<RequestPasswordResetResult> {
  const normalizedEmail = params.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    await prisma.auditLog.create({
      data: {
        action: 'PASSWORD_RESET_ATTEMPT_UNKNOWN_EMAIL',
        result: 'DENIED',
        ip: params.ip,
        meta: {
          emailAttempted: normalizedEmail.slice(0, 3) + '***@' + (normalizedEmail.split('@')[1] || ''),
        },
      },
    });

    return {
      success: true,
      userFound: false,
    };
  }

  // Gera token de 32 bytes (64 chars hex) e hash SHA-256
  const { rawToken, tokenHash } = generateActionToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos (Regra 10)

  await prisma.$transaction(async (tx) => {
    // Revoga/descarta tokens anteriores não utilizados do mesmo propósito
    await tx.actionToken.deleteMany({
      where: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        usedAt: null,
      },
    });

    // Cria o novo token com hash
    await tx.actionToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash,
        expiresAt,
      },
    });

    // Auditoria
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        targetType: 'User',
        targetId: user.id,
        result: 'SUCCESS',
        ip: params.ip,
        meta: {
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });

  return {
    success: true,
    userFound: true,
    rawToken,
    expiresAt,
  };
}

export interface VerifyPasswordResetTokenResult {
  valid: boolean;
  reason?: 'NOT_FOUND' | 'ALREADY_USED' | 'EXPIRED' | 'USER_INACTIVE';
  userName?: string;
}

/**
 * Verifica validade do token de redefinição de senha antes da exibição do formulário.
 */
export async function verifyPasswordResetToken(
  rawToken: string
): Promise<VerifyPasswordResetTokenResult> {
  if (!rawToken || rawToken.length < 32) {
    return { valid: false, reason: 'NOT_FOUND' };
  }

  const tokenHash = hashActionToken(rawToken);

  const actionToken = await prisma.actionToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, name: true, status: true },
      },
    },
  });

  if (!actionToken || actionToken.purpose !== 'PASSWORD_RESET') {
    return { valid: false, reason: 'NOT_FOUND' };
  }

  const check = isActionTokenValid({
    usedAt: actionToken.usedAt,
    expiresAt: actionToken.expiresAt,
  });

  if (!check.valid) {
    return { valid: false, reason: check.reason };
  }

  if (actionToken.user.status !== 'ACTIVE') {
    return { valid: false, reason: 'USER_INACTIVE' };
  }

  return {
    valid: true,
    userName: actionToken.user.name.split(' ')[0] || actionToken.user.name,
  };
}

export interface ResetPasswordWithTokenParams {
  rawToken: string;
  newPassword: string;
  ip?: string;
}

export interface ResetPasswordWithTokenResult {
  success: boolean;
  userId: string;
  userName: string;
}

/**
 * Redefine a senha do usuário com consumo atômico do ActionToken e revogação de sessões anteriores.
 */
export async function resetPasswordWithToken(
  params: ResetPasswordWithTokenParams
): Promise<ResetPasswordWithTokenResult> {
  const { rawToken, newPassword, ip } = params;

  if (!rawToken || rawToken.length < 32) {
    throw new Error('Link de redefinição inválido.');
  }

  const policyCheck = validatePasswordPolicy(newPassword);
  if (!policyCheck.valid) {
    throw new Error(policyCheck.message || 'A senha não atende aos requisitos mínimos de segurança.');
  }

  const tokenHash = hashActionToken(rawToken);

  return await prisma.$transaction(async (tx) => {
    const actionToken = await tx.actionToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!actionToken || actionToken.purpose !== 'PASSWORD_RESET') {
      await tx.auditLog.create({
        data: {
          action: 'PASSWORD_RESET_FAILED_INVALID_TOKEN',
          result: 'DENIED',
          ip,
        },
      });
      throw new Error('Link de redefinição inválido ou não encontrado.');
    }

    const check = isActionTokenValid({
      usedAt: actionToken.usedAt,
      expiresAt: actionToken.expiresAt,
    });

    if (!check.valid) {
      await tx.auditLog.create({
        data: {
          actorId: actionToken.userId,
          action: 'PASSWORD_RESET_FAILED',
          result: 'DENIED',
          ip,
          meta: { reason: check.reason, actionTokenId: actionToken.id },
        },
      });

      if (check.reason === 'ALREADY_USED') {
        throw new Error('Este link de redefinição já foi utilizado anteriormente.');
      }
      throw new Error('Este link de redefinição expirou. Solicite um novo link.');
    }

    if (actionToken.user.status !== 'ACTIVE') {
      throw new Error('Conta de usuário inativa ou pendente.');
    }

    const newPasswordHash = hashPassword(newPassword);

    // 1. Marca token como usado
    await tx.actionToken.update({
      where: { id: actionToken.id },
      data: { usedAt: new Date() },
    });

    // 2. Atualiza a senha e zera contadores de falha
    await tx.user.update({
      where: { id: actionToken.userId },
      data: {
        passwordHash: newPasswordHash,
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    // 3. Revoga todos os refresh tokens anteriores (encerra outras sessões)
    await tx.refreshToken.updateMany({
      where: {
        userId: actionToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // 4. Trilha de auditoria
    await tx.auditLog.create({
      data: {
        actorId: actionToken.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        targetType: 'User',
        targetId: actionToken.userId,
        result: 'SUCCESS',
        ip,
        meta: {
          actionTokenId: actionToken.id,
        },
      },
    });

    return {
      success: true,
      userId: actionToken.userId,
      userName: actionToken.user.name,
    };
  });
}

// ---- Gestão de Tokens de Sessão App / Mobile (Regra 10) ----

export interface CreateAppSessionTokensParams {
  userId: string;
  deviceName?: string;
  ip?: string;
  familyId?: string;
}

/**
 * Emite um novo par de tokens para aplicativo mobile (Capacitor/App).
 * Cria um registro em RefreshToken com familyId e hash SHA-256.
 */
export async function createAppSessionTokens(params: CreateAppSessionTokensParams) {
  const { userId, deviceName, ip, familyId } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw new Error('Usuário inativo ou não autorizado.');
  }

  const pair = generateRefreshTokenPair(familyId);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId: pair.familyId,
        tokenHash: pair.tokenHash,
        deviceName: deviceName || null,
        expiresAt: pair.expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        churchId: user.churchId,
        action: 'APP_TOKEN_ISSUED',
        targetType: 'User',
        targetId: user.id,
        result: 'SUCCESS',
        ip,
        meta: {
          familyId: pair.familyId,
          deviceName: deviceName || 'Desconhecido',
          expiresAt: pair.expiresAt.toISOString(),
        },
      },
    });
  });

  return {
    rawRefreshToken: pair.rawRefreshToken,
    familyId: pair.familyId,
    expiresAt: pair.expiresAt,
    user,
  };
}

export interface RotateAppRefreshTokenParams {
  rawRefreshToken: string;
  deviceName?: string;
  ip?: string;
}

/**
 * Rotaciona um Refresh Token com detecção de reuso estrita (Regra 10 & Item 6):
 * - Se o token for válido e ativo: revoga o atual, emite novo na mesma família.
 * - Se o token já tiver sido revogado (REUSO DETECTADO): revoga imediatamente toda a família de tokens.
 */
export async function rotateAppRefreshToken(params: RotateAppRefreshTokenParams) {
  const { rawRefreshToken, deviceName, ip } = params;
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!tokenRecord) {
    await prisma.auditLog.create({
      data: {
        action: 'APP_TOKEN_REFRESH_FAILED',
        result: 'DENIED',
        ip,
        meta: { reason: 'TOKEN_NOT_FOUND' },
      },
    });
    throw new Error('Sessão expirada ou inválida. Faça login novamente.');
  }

  const evaluation = evaluateRefreshToken(tokenRecord);

  // DETECÇÃO DE REUSO: token já revogado sendo apresentado novamente
  if (evaluation.reuseDetected) {
    await prisma.$transaction(async (tx) => {
      // Revoga TODOS os tokens da família por segurança
      await tx.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorId: tokenRecord.userId,
          churchId: tokenRecord.user.churchId,
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          targetType: 'RefreshTokenFamily',
          targetId: tokenRecord.familyId,
          result: 'DENIED',
          ip,
          meta: {
            revokedFamilyId: tokenRecord.familyId,
            deviceName: deviceName || tokenRecord.deviceName,
            warning: 'Possível tentativa de roubo ou replay de token.',
          },
        },
      });
    });

    throw new Error('Reuso de token detectado. Todas as sessões deste dispositivo foram revogadas por segurança.');
  }

  if (!evaluation.valid) {
    await prisma.auditLog.create({
      data: {
        actorId: tokenRecord.userId,
        churchId: tokenRecord.user.churchId,
        action: 'APP_TOKEN_REFRESH_FAILED',
        result: 'DENIED',
        ip,
        meta: { reason: evaluation.reason },
      },
    });
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (tokenRecord.user.status !== 'ACTIVE') {
    throw new Error('Conta não autorizada ou inativa.');
  }

  // Rotação atômica
  const newPair = generateRefreshTokenPair(tokenRecord.familyId);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    await tx.refreshToken.create({
      data: {
        userId: tokenRecord.userId,
        familyId: tokenRecord.familyId,
        tokenHash: newPair.tokenHash,
        deviceName: deviceName || tokenRecord.deviceName,
        expiresAt: newPair.expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: tokenRecord.userId,
        churchId: tokenRecord.user.churchId,
        action: 'APP_TOKEN_ROTATED',
        targetType: 'User',
        targetId: tokenRecord.userId,
        result: 'SUCCESS',
        ip,
        meta: {
          familyId: tokenRecord.familyId,
          deviceName: deviceName || tokenRecord.deviceName,
        },
      },
    });
  });

  return {
    rawRefreshToken: newPair.rawRefreshToken,
    familyId: tokenRecord.familyId,
    expiresAt: newPair.expiresAt,
    user: tokenRecord.user,
  };
}

/**
 * Revoga toda a família de refresh tokens (ex.: logout de um dispositivo específico).
 */
export async function revokeAppRefreshTokenFamily(familyId: string, ip?: string, actorId?: string) {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (actorId) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'APP_TOKEN_FAMILY_REVOKED',
          targetType: 'RefreshTokenFamily',
          targetId: familyId,
          result: 'SUCCESS',
          ip,
          meta: { revokedCount: updated.count },
        },
      });
    }

    return updated.count;
  });
}

/**
 * Revoga todos os tokens mobile de um usuário (ex.: ao alterar senha ou encerrar sessões).
 */
export async function revokeAllUserAppTokens(userId: string, ip?: string, actorId?: string) {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || userId,
        action: 'ALL_APP_TOKENS_REVOKED',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        ip,
        meta: { revokedCount: updated.count },
      },
    });

    return updated.count;
  });
}

// ---- Gestão de Membros de Departamentos ----

export interface AddDepartmentMemberParams {
  departmentId: string;
  userId: string;
  role?: 'MANAGER' | 'MEMBER';
  functionIds?: string[];
  actorId?: string;
  ip?: string;
}

export async function addDepartmentMemberWithAudit(params: AddDepartmentMemberParams) {
  const { departmentId, userId, role = 'MEMBER', functionIds = [], actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const department = await tx.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new Error('Departamento não encontrado.');
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new Error('Voluntário não encontrado.');
    }
    if (user.status !== 'ACTIVE') {
      throw new Error(`Voluntário não está ativo (status atual: ${user.status}).`);
    }

    if (department.churchId && user.churchId && department.churchId !== user.churchId) {
      throw new Error('O voluntário indicado pertence a outra congregação.');
    }

    const member = await tx.departmentMember.upsert({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      update: { role },
      create: { userId, departmentId, role },
    });

    // Se houver funções especificadas, valida e insere
    if (functionIds.length > 0) {
      const validFunctions = await tx.departmentFunction.findMany({
        where: {
          departmentId,
          id: { in: functionIds },
        },
      });
      const validFunctionIds = validFunctions.map((f) => f.id);

      for (const funcId of validFunctionIds) {
        await tx.memberFunction.upsert({
          where: {
            memberId_functionId: {
              memberId: member.id,
              functionId: funcId,
            },
          },
          update: {},
          create: {
            memberId: member.id,
            functionId: funcId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        churchId: department.churchId || undefined,
        action: 'DEPARTMENT_MEMBER_ADDED',
        targetType: 'DepartmentMember',
        targetId: member.id,
        result: 'SUCCESS',
        ip,
        meta: {
          departmentId,
          departmentName: department.name,
          userId,
          userName: user.name,
          role,
          functionIds,
        },
      },
    });

    return member;
  });
}

export interface UpdateDepartmentMemberParams {
  departmentId: string;
  userId: string;
  role?: 'MANAGER' | 'MEMBER';
  functionIds: string[];
  actorId?: string;
  ip?: string;
}

export async function updateDepartmentMemberWithAudit(params: UpdateDepartmentMemberParams) {
  const { departmentId, userId, role, functionIds, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const member = await tx.departmentMember.findUnique({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      include: {
        department: true,
        user: true,
      },
    });

    if (!member) {
      throw new Error('Voluntário não está vinculado a este departamento.');
    }

    // Atualiza papel se fornecido
    if (role && role !== member.role) {
      await tx.departmentMember.update({
        where: { id: member.id },
        data: { role },
      });
    }

    // Sincroniza funções: remove as que não estão na lista e adiciona as novas
    await tx.memberFunction.deleteMany({
      where: {
        memberId: member.id,
        functionId: { notIn: functionIds },
      },
    });

    if (functionIds.length > 0) {
      const validFunctions = await tx.departmentFunction.findMany({
        where: {
          departmentId,
          id: { in: functionIds },
        },
      });

      for (const func of validFunctions) {
        await tx.memberFunction.upsert({
          where: {
            memberId_functionId: {
              memberId: member.id,
              functionId: func.id,
            },
          },
          update: {},
          create: {
            memberId: member.id,
            functionId: func.id,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        churchId: member.department.churchId || undefined,
        action: 'DEPARTMENT_MEMBER_UPDATED',
        targetType: 'DepartmentMember',
        targetId: member.id,
        result: 'SUCCESS',
        ip,
        meta: {
          departmentId,
          departmentName: member.department.name,
          userId,
          userName: member.user.name,
          newRole: role || member.role,
          functionIds,
        },
      },
    });

    return { success: true };
  });
}

export interface RemoveDepartmentMemberParams {
  departmentId: string;
  userId: string;
  actorId?: string;
  ip?: string;
}

export async function removeDepartmentMemberInternal(
  tx: Prisma.TransactionClient,
  params: { departmentId: string; userId: string; actorId?: string; ip?: string }
) {
  const { departmentId, userId, actorId, ip } = params;

  const member = await tx.departmentMember.findUnique({
    where: {
      userId_departmentId: { userId, departmentId },
    },
    include: {
      department: true,
      user: true,
    },
  });

  if (!member) {
    return { success: false, reprocessedCount: 0, substitutedCount: 0, openedSlotsCount: 0 };
  }

  // 1. Remove funções associadas
  await tx.memberFunction.deleteMany({
    where: { memberId: member.id },
  });

  // 2. Remove vínculo com o departamento
  await tx.departmentMember.delete({
    where: { id: member.id },
  });

  // 3. Localiza escalas futuras do membro naquele departamento
  const now = new Date();
  const futureAssignments = await tx.assignment.findMany({
    where: {
      userId,
      status: { in: ['PENDING', 'CONFIRMED', 'PENDING_APPROVAL'] },
      slot: {
        departmentId,
        startsAt: { gte: now },
      },
    },
    include: {
      slot: {
        include: {
          program: true,
          department: true,
          function: true,
        },
      },
    },
  });

  let substitutedCount = 0;
  let openedSlotsCount = 0;

  for (const assignment of futureAssignments) {
    const slot = assignment.slot;
    const removalReason = `Desvinculado do departamento ${member.department.name}`;

    const subOutcome = await findAndAssignSubstituteInternal(tx, {
      slot,
      originalAssignmentId: assignment.id,
      originalUserId: userId,
      declinedReason: removalReason,
      actorId,
      ip,
      auditAction: 'ASSIGNMENT_AUTO_SUBSTITUTED',
      auditReasonMeta: 'DESVINCULADO_DEPARTAMENTO',
    });

    if (subOutcome.newAssignment) {
      substitutedCount++;
    } else {
      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          status: 'DECLINED',
          declinedReason: removalReason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          churchId: member.department.churchId || undefined,
          action: 'ASSIGNMENT_OPENED_FROM_REMOVAL',
          targetType: 'Assignment',
          targetId: assignment.id,
          result: 'SUCCESS',
          ip,
          meta: {
            reason: 'DESVINCULADO_DEPARTAMENTO_SEM_SUBSTITUTO',
            originalUserId: userId,
            slotId: slot.id,
            programTitle: slot.program.title,
          },
        },
      });

      openedSlotsCount++;
    }
  }

  // 4. Auditoria de desvinculação
  await tx.auditLog.create({
    data: {
      actorId,
      churchId: member.department.churchId || undefined,
      action: 'DEPARTMENT_MEMBER_REMOVED',
      targetType: 'DepartmentMember',
      targetId: member.id,
      result: 'SUCCESS',
      ip,
      meta: {
        departmentId,
        departmentName: member.department.name,
        userId,
        userName: member.user.name,
        futureAssignmentsReprocessed: futureAssignments.length,
        substitutedCount,
        openedSlotsCount,
      },
    },
  });

  return {
    success: true,
    reprocessedCount: futureAssignments.length,
    substitutedCount,
    openedSlotsCount,
  };
}

export async function removeDepartmentMemberWithAudit(params: RemoveDepartmentMemberParams) {
  return await prisma.$transaction(async (tx) => {
    return await removeDepartmentMemberInternal(tx, params);
  });
}

export interface AssignDepartmentManagerParams {
  departmentId: string;
  userId: string;
  actorId?: string;
  ip?: string;
}

export async function assignDepartmentManagerWithAudit(params: AssignDepartmentManagerParams) {
  const { departmentId, userId, actorId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const department = await tx.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new Error('Departamento não encontrado.');
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Voluntário não encontrado ou inativo.');
    }

    if (department.churchId && user.churchId && department.churchId !== user.churchId) {
      throw new Error('O voluntário indicado pertence a outra congregação.');
    }

    const member = await tx.departmentMember.upsert({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      update: { role: 'MANAGER' },
      create: { userId, departmentId, role: 'MANAGER' },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        churchId: department.churchId || undefined,
        action: 'DEPARTMENT_MANAGER_ASSIGNED',
        targetType: 'DepartmentMember',
        targetId: member.id,
        result: 'SUCCESS',
        ip,
        meta: {
          departmentId,
          departmentName: department.name,
          userId,
          userName: user.name,
        },
      },
    });

    return member;
  });
}

// ---- Exclusão / Anonimização de Dados do Titular (LGPD) ----

export interface EraseUserDataParams {
  userId: string;
  passwordConfirm: string;
  reason?: string;
  ip?: string;
}

export async function eraseUserDataWithAudit(params: EraseUserDataParams) {
  const { userId, passwordConfirm, reason, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Usuário não encontrado.');
    }

    // Valida senha
    const isPasswordValid = verifyPassword(passwordConfirm, user.passwordHash);
    if (!isPasswordValid) {
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'USER_DATA_ERASURE_FAILED',
          result: 'DENIED',
          ip,
          meta: { reason: 'SENHA_INCORRETA' },
        },
      });
      throw new Error('Senha incorreta. Não foi possível confirmar a exclusão dos dados.');
    }

    // Regra de segurança: Sempre existe ao menos um ADMIN_MASTER
    if (user.globalRole === 'ADMIN_MASTER') {
      const activeAdminCount = await tx.user.count({
        where: { globalRole: 'ADMIN_MASTER', status: 'ACTIVE' },
      });
      if (activeAdminCount <= 1) {
        throw new Error(
          'Operação bloqueada: Esta conta é o único Administrador Geral ativo do sistema. Nomeie outro administrador antes de desativar ou excluir esta conta.'
        );
      }
    }

    // 1. Revoga todos os tokens
    await tx.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });

    await tx.actionToken.deleteMany({
      where: { userId },
    });

    // 2. Remove períodos de indisponibilidade e preferências
    await tx.availability.deleteMany({
      where: { userId },
    });

    // 3. Remove push subscriptions
    await tx.pushSubscription.deleteMany({
      where: { userId },
    });

    // 4. Remove vínculos de departamentos e funções
    const memberships = await tx.departmentMember.findMany({
      where: { userId },
    });
    for (const m of memberships) {
      await tx.memberFunction.deleteMany({
        where: { memberId: m.id },
      });
    }
    await tx.departmentMember.deleteMany({
      where: { userId },
    });

    // 5. Anonimização irreversível dos dados pessoais (LGPD - preserva integridade histórica das escalas)
    const anonymizedEmail = `anon-${user.id.slice(-8)}@removido.local`;
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Voluntário Desativado (LGPD)',
        email: anonymizedEmail,
        passwordHash: 'ERASED',
        status: 'INACTIVE',
        phonePrimary: null,
        phoneSecondary: null,
        whatsapp: null,
        address: Prisma.DbNull,
        emergencyContact: Prisma.DbNull,
        photoUrl: null,
        birthDate: null,
        gender: null,
        maritalStatus: null,
        notes: null,
        joinedAt: null,
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaRecoveryCodes: Prisma.DbNull,
      },
    });

    // 6. Auditoria sem dados pessoais
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'USER_DATA_ERASED_LGPD',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        ip,
        meta: {
          reason: reason || 'Solicitado pelo titular dos dados via aplicativo',
          anonymizedEmail,
        },
      },
    });

    return { success: true };
  });
}

/**
 * Busca vagas abertas e substituições pendentes com sugestão inteligente de candidatos.
 */
export interface OpenSlotSuggestion {
  slotId: string;
  slotTitle: string;
  programId: string;
  programTitle: string;
  departmentId: string;
  departmentName: string;
  functionId?: string | null;
  functionName?: string | null;
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  currentAssignmentsCount: number;
  declinedAssignments: {
    id: string;
    userId: string;
    userName: string;
    declinedReason?: string | null;
  }[];
  suggestedCandidates: {
    userId: string;
    userName: string;
    assignmentsLast60Days: number;
    lastAssignmentDate?: string | null;
  }[];
}

export async function getOpenSlotsWithSuggestions(
  departmentIds?: string[],
  churchId?: string
): Promise<OpenSlotSuggestion[]> {
  const now = new Date();

  // Busca programas futuros
  const slots = await prisma.programSlot.findMany({
    where: {
      startsAt: { gte: now },
      ...(departmentIds && departmentIds.length > 0 ? { departmentId: { in: departmentIds } } : {}),
      ...(churchId ? { department: { churchId } } : {}),
    },
    include: {
      program: true,
      department: true,
      function: true,
      assignments: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
  });

  // Busca todos os voluntários ativos e suas escalas recentes para alimentar o ranking
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const activeUsers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(churchId ? { churchId } : {}),
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
          slot: {
            startsAt: { gte: sixtyDaysAgo },
          },
        },
        include: {
          slot: true,
        },
      },
    },
  });

  const results: OpenSlotSuggestion[] = [];

  for (const slot of slots) {
    const activeAssignments = slot.assignments.filter(
      (a) => a.status === 'PENDING' || a.status === 'CONFIRMED'
    );
    const declined = slot.assignments.filter((a) => a.status === 'DECLINED');

    const isOpen = activeAssignments.length < slot.requiredCount || declined.length > 0;
    if (!isOpen) {
      continue;
    }

    const slotReq: SlotRequirement = {
      id: slot.id,
      departmentId: slot.departmentId,
      functionId: slot.functionId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    };

    // Monta candidatos elegíveis
    const candidatesStats: {
      candidate: CandidateUser;
      assignmentsLast60Days: number;
      lastAssignmentDate?: Date;
    }[] = [];

    for (const u of activeUsers) {
      // Já está escalado neste próprio slot?
      if (activeAssignments.some((a) => a.userId === u.id)) {
        continue;
      }

      const candidateUser: CandidateUser = {
        id: u.id,
        name: u.name,
        status: u.status as 'ACTIVE',
        departmentMemberships: u.memberships.map((m) => ({
          departmentId: m.departmentId,
          functions: m.functions.map((f) => ({ functionId: f.functionId })),
        })),
        availabilities: u.availabilities.map((av) => ({
          kind: av.kind,
          weekday: av.weekday,
          from: av.from,
          to: av.to,
        })),
        assignments: u.assignments.map((a) => ({
          id: a.id,
          departmentId: a.slot.departmentId,
          startsAt: a.slot.startsAt,
          endsAt: a.slot.endsAt,
          status: mapStatusForConflictCheck(a.status),
        })),
      };

      const eligibility = checkEligibility(candidateUser, slotReq);
      if (eligibility.eligible) {
        // Calcula quantidade de escalas nos últimos 60 dias
        const validRecent = u.assignments.filter((a) => a.status !== 'DECLINED');
        const sortedRecent = [...validRecent].sort(
          (a, b) => new Date(b.slot.startsAt).getTime() - new Date(a.slot.startsAt).getTime()
        );

        candidatesStats.push({
          candidate: candidateUser,
          assignmentsLast60Days: validRecent.length,
          lastAssignmentDate: sortedRecent[0] ? new Date(sortedRecent[0].slot.startsAt) : undefined,
        });
      }
    }

    const ranked = rankCandidates(candidatesStats);
    const topSuggestions = ranked.slice(0, 5).map((c) => {
      const stat = candidatesStats.find((s) => s.candidate.id === c.id);
      return {
        userId: c.id,
        userName: c.name,
        assignmentsLast60Days: stat?.assignmentsLast60Days || 0,
        lastAssignmentDate: stat?.lastAssignmentDate?.toISOString() || null,
      };
    });

    results.push({
      slotId: slot.id,
      slotTitle: slot.title,
      programId: slot.programId,
      programTitle: slot.program.title,
      departmentId: slot.departmentId,
      departmentName: slot.department.name,
      functionId: slot.functionId,
      functionName: slot.function?.name,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      requiredCount: slot.requiredCount,
      currentAssignmentsCount: activeAssignments.length,
      declinedAssignments: declined.map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        declinedReason: d.declinedReason,
      })),
      suggestedCandidates: topSuggestions,
    });
  }

  return results;
}

/**
 * Obtém ou gera token revogável para feed de calendário (.ics / webcal).
 */
export async function getOrCreateCalendarToken(userId: string): Promise<string> {
  const existing = await prisma.actionToken.findFirst({
    where: {
      userId,
      purpose: 'CALENDAR_FEED',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Como no banco guardamos o hash, para assinatura contínua podemos gerar um novo se o usuário solicitar
    // ou se já temos ativo. Para maior conveniência e conformidade com ADR-011, se o usuário pedir na interface
    // geramos um novo token com validade de 365 dias e revogamos os anteriores do mesmo propósito.
  }

  const { rawToken, tokenHash } = generateActionToken(32);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 ano

  await prisma.actionToken.create({
    data: {
      userId,
      purpose: 'CALENDAR_FEED',
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Busca as escalas do membro a partir do token de calendário para gerar o .ics.
 */
export async function getCalendarFeedEventsByToken(rawToken: string) {
  const tokenHash = hashActionToken(rawToken);

  const actionToken = await prisma.actionToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  if (!actionToken || actionToken.purpose !== 'CALENDAR_FEED') {
    return null;
  }

  if (new Date() > actionToken.expiresAt) {
    return null;
  }

  if (actionToken.user.status !== 'ACTIVE') {
    return null;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const assignments = await prisma.assignment.findMany({
    where: {
      userId: actionToken.userId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      slot: {
        startsAt: { gte: thirtyDaysAgo },
      },
    },
    include: {
      slot: {
        include: {
          program: true,
          department: true,
          function: true,
        },
      },
    },
    orderBy: {
      slot: {
        startsAt: 'asc',
      },
    },
  });

  return {
    userName: actionToken.user.name,
    events: assignments.map((asg) => ({
      id: asg.id,
      title: `Escala: ${asg.slot.department.name}${asg.slot.function ? ` (${asg.slot.function.name})` : ''}`,
      description: `Culto: ${asg.slot.program.title}\nDepartamento: ${asg.slot.department.name}\nStatus: ${asg.status === 'CONFIRMED' ? 'Confirmado' : 'Pendente de confirmação'}`,
      startsAt: asg.slot.startsAt,
      endsAt: asg.slot.endsAt,
      status: 'CONFIRMED' as const,
    })),
  };
}

/**
 * Desmarca uma escala e, se a feature flag auto_substitution estiver ativa,
 * busca e atribui automaticamente o melhor substituto elegível.
 */
export async function declineWithAutoSubstitution(params: {
  assignmentId: string;
  reason?: string;
  actorId?: string;
  ip?: string;
  forceAutoSubstitute?: boolean;
}) {
  const { assignmentId, reason, actorId, ip, forceAutoSubstitute } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Busca a escala com todos os dados do slot, programa e usuário
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

    if (actorId && assignment.userId !== actorId) {
      await tx.auditLog.create({
        data: {
          actorId,
          churchId: assignment.slot.department.churchId || undefined,
          action: 'ASSIGNMENT_DECLINE_DENIED',
          targetType: 'Assignment',
          targetId: assignmentId,
          result: 'DENIED',
          ip,
          meta: { reason: 'IDOR_ATTEMPT', ownerUserId: assignment.userId },
        },
      });
      throw new Error('Operação negada: você só pode desmarcar escalas atribuídas a você.');
    }

    // 2. Atualiza a escala original para DECLINED
    const declinedAssignment = await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'DECLINED',
        declinedReason: reason || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorId || assignment.userId,
        action: 'ASSIGNMENT_DECLINED',
        targetType: 'Assignment',
        targetId: assignmentId,
        result: 'SUCCESS',
        ip,
        meta: { reason, slotId: assignment.slotId, programTitle: assignment.slot.program.title },
      },
    });

    // 3. Verifica se a substituição automática está ativa
    let isAutoSubActive = !!forceAutoSubstitute;
    if (!isAutoSubActive) {
      const flag = await tx.featureFlag.findUnique({
        where: { key: 'auto_substitution' },
      });
      isAutoSubActive = flag?.enabled ?? false;
    }

    if (!isAutoSubActive) {
      return {
        declinedAssignment,
        newAssignment: null,
        substituteUser: null,
        autoSubstituted: false,
        diagnosis: 'Substituição automática desativada nas configurações.',
      };
    }

    // 4. Executa a busca pelo melhor substituto via helper unificado
    const slot = assignment.slot;
    const subOutcome = await findAndAssignSubstituteInternal(tx, {
      slot,
      originalAssignmentId: assignment.id,
      originalUserId: assignment.userId,
      declinedReason: reason || null,
      actorId: actorId || 'SYSTEM_AUTO_SUB',
      ip,
    });

    if (!subOutcome.newAssignment) {
      await tx.auditLog.create({
        data: {
          actorId,
          churchId: slot.department.churchId || undefined,
          action: 'AUTO_SUBSTITUTION_NO_CANDIDATE',
          targetType: 'ProgramSlot',
          targetId: slot.id,
          result: 'FAILED',
          ip,
          meta: { diagnosis: subOutcome.diagnosis },
        },
      });

      return {
        declinedAssignment,
        newAssignment: null,
        substituteUser: null,
        autoSubstituted: false,
        diagnosis: subOutcome.diagnosis,
      };
    }

    return {
      declinedAssignment: { ...declinedAssignment, status: 'SUBSTITUTED' as const },
      newAssignment: subOutcome.newAssignment,
      substituteUser: subOutcome.newAssignment.user,
      autoSubstituted: true,
      diagnosis: undefined,
    };
  });
}

/**
 * Cria solicitação de troca de escala com validações de regra e auditoria.
 */
export async function createSwapRequestWithAudit(params: {
  assignmentId: string;
  requesterId: string;
  targetUserId?: string | null;
  targetAssignmentId?: string | null;
  reason?: string;
  ip?: string;
}) {
  const { assignmentId, requesterId, targetUserId, targetAssignmentId, reason, ip } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Verifica se a escala de origem existe e pertence ao solicitante
    const assignment = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: {
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
      throw new Error('Escala de origem não encontrada.');
    }

    if (assignment.userId !== requesterId) {
      throw new Error('Você só pode solicitar trocas para escalas atribuídas a você.');
    }

    if (assignment.slot.startsAt <= new Date()) {
      throw new Error('Não é possível solicitar troca para escalas já iniciadas ou passadas.');
    }

    if (assignment.status === 'DECLINED' || assignment.status === 'SUBSTITUTED') {
      throw new Error('Não é possível pedir troca para uma escala desmarcada ou substituída.');
    }

    // 2. Se houver voluntário alvo indicado, valida elegibilidade
    if (targetUserId) {
      if (targetUserId === requesterId) {
        throw new Error('Você não pode propor troca para si mesmo.');
      }

      await validateSwapTargetCandidateInTx(tx, {
        requesterId,
        targetUserId,
        originSlot: assignment.slot,
        excludeAssignmentId: targetAssignmentId,
      });
    }

    // 3. Cria a solicitação de troca
    const swap = await tx.swapRequest.create({
      data: {
        assignmentId,
        requesterId,
        targetUserId: targetUserId || null,
        targetAssignmentId: targetAssignmentId || null,
        reason: reason || null,
        status: 'PENDING_TARGET',
      },
      include: {
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
        requester: true,
        targetUser: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: requesterId,
        churchId: assignment.slot.department.churchId || undefined,
        action: 'SWAP_REQUEST_CREATED',
        targetType: 'SwapRequest',
        targetId: swap.id,
        result: 'SUCCESS',
        ip,
        meta: {
          assignmentId,
          targetUserId: targetUserId || null,
          programTitle: assignment.slot.program.title,
        },
      },
    });

    return swap;
  });
}

/**
 * Responde a um pedido de troca (o colega convidado aceita ou recusa a proposta).
 */
export async function respondSwapRequestWithAudit(params: {
  swapRequestId: string;
  userId: string;
  action: 'ACCEPT' | 'REJECT';
  reason?: string;
  ip?: string;
}) {
  const { swapRequestId, userId, action, reason, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const swap = await tx.swapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        assignment: {
          include: {
            slot: {
              include: {
                department: true,
              },
            },
          },
        },
        requester: true,
        targetUser: true,
      },
    });

    if (!swap) {
      throw new Error('Pedido de troca não encontrado.');
    }

    const canRespond = canRespondSwap(swap, userId);
    if (!canRespond) {
      throw new Error('Você não tem permissão para responder a este pedido de troca.');
    }

    if (action === 'REJECT') {
      const updated = await tx.swapRequest.update({
        where: { id: swapRequestId },
        data: {
          status: 'REJECTED',
          reason: reason || swap.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'SWAP_REQUEST_REJECTED_BY_TARGET',
          targetType: 'SwapRequest',
          targetId: swapRequestId,
          result: 'SUCCESS',
          ip,
          meta: { reason },
        },
      });

      return updated;
    }

    // Valida elegibilidade (conflito de horário, limite diário, indisponibilidade e departamento/função)
    const effectiveTargetUserId = swap.targetUserId || userId;
    await acquireUserLock(tx, effectiveTargetUserId);
    await validateSwapTargetCandidateInTx(tx, {
      requesterId: swap.requesterId,
      targetUserId: effectiveTargetUserId,
      originSlot: swap.assignment.slot,
      excludeAssignmentId: swap.targetAssignmentId,
    });

    // Se aceitou, avança para aprovação do gestor
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: {
        status: 'PENDING_MANAGER',
        targetUserId: effectiveTargetUserId, // Define alvo se era pedido aberto
      },
      include: {
        assignment: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
              },
            },
          },
        },
        requester: true,
        targetUser: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'SWAP_REQUEST_ACCEPTED_BY_TARGET',
        targetType: 'SwapRequest',
        targetId: swapRequestId,
        result: 'SUCCESS',
        ip,
      },
    });

    return updated;
  });
}

/**
 * Gestor ou Admin aprova ou rejeita a troca com transferência atômica de titularidade.
 */
export async function approveSwapRequestWithLock(params: {
  swapRequestId: string;
  reviewerId: string;
  action: 'APPROVE' | 'REJECT';
  notes?: string;
  ip?: string;
}) {
  const { swapRequestId, reviewerId, action, notes, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const swap = await tx.swapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        assignment: {
          include: {
            slot: {
              include: {
                department: true,
                program: true,
              },
            },
          },
        },
        requester: true,
        targetUser: true,
      },
    });

    if (!swap) {
      throw new Error('Pedido de troca não encontrado.');
    }

    if (swap.status !== 'PENDING_MANAGER') {
      throw new Error(`Este pedido de troca não está aguardando aprovação do gestor (status atual: ${swap.status}).`);
    }

    // Verifica permissão do revisor (Gestor do departamento, Ancião da congregação, Pastor ou ADMIN_MASTER)
    const reviewer = await tx.user.findUnique({
      where: { id: reviewerId },
      include: {
        memberships: true,
        pastorChurches: true,
      },
    });

    if (!reviewer) {
      throw new Error('Gestor revisor não encontrado.');
    }

    const deptChurchId = swap.assignment.slot.department.churchId;
    const isAdmin = reviewer.globalRole === 'ADMIN_MASTER';
    const isPastor =
      reviewer.globalRole === 'PASTOR' &&
      (!deptChurchId || reviewer.pastorChurches.some((pc) => pc.churchId === deptChurchId));
    const isElder = reviewer.globalRole === 'ELDER' && (!deptChurchId || reviewer.churchId === deptChurchId);
    const isDeptManager = reviewer.memberships.some(
      (m) => m.departmentId === swap.assignment.slot.departmentId && m.role === 'MANAGER'
    );

    if (!isAdmin && !isPastor && !isElder && !isDeptManager) {
      throw new Error('Você não tem permissão para aprovar trocas deste departamento.');
    }

    if (action === 'REJECT') {
      const updated = await tx.swapRequest.update({
        where: { id: swapRequestId },
        data: {
          status: 'REJECTED',
          reviewedById: reviewerId,
          managerNotes: notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          churchId: deptChurchId || undefined,
          action: 'SWAP_REQUEST_REJECTED_BY_MANAGER',
          targetType: 'SwapRequest',
          targetId: swapRequestId,
          result: 'SUCCESS',
          ip,
          meta: { notes },
        },
      });

      return updated;
    }

    // Ação: APPROVE
    if (!swap.targetUserId) {
      throw new Error('Não há voluntário substituto definido para esta troca.');
    }

    // Adquire lock e revalida elegibilidade do substituto (evita race condition entre aceite e aprovação)
    await acquireUserLock(tx, swap.targetUserId);
    await validateSwapTargetCandidateInTx(tx, {
      requesterId: swap.requesterId,
      targetUserId: swap.targetUserId,
      originSlot: swap.assignment.slot,
      excludeAssignmentId: swap.targetAssignmentId,
    });

    if (swap.targetAssignmentId) {
      await acquireUserLock(tx, swap.requesterId);
      const targetAsg = await tx.assignment.findUnique({
        where: { id: swap.targetAssignmentId },
        include: {
          slot: {
            include: {
              department: true,
            },
          },
        },
      });
      if (!targetAsg) {
        throw new Error('Escala de contrapartida não encontrada.');
      }
      await validateSwapTargetCandidateInTx(tx, {
        requesterId: swap.targetUserId,
        targetUserId: swap.requesterId,
        originSlot: targetAsg.slot,
        excludeAssignmentId: swap.assignmentId,
      });
    }

    // 1. Atualiza a titularidade da escala de origem para o novo voluntário
    await tx.assignment.update({
      where: { id: swap.assignmentId },
      data: {
        userId: swap.targetUserId,
        status: 'CONFIRMED',
      },
    });

    // 2. Se for permuta mútua com escala de volta
    if (swap.targetAssignmentId) {
      await tx.assignment.update({
        where: { id: swap.targetAssignmentId },
        data: {
          userId: swap.requesterId,
          status: 'CONFIRMED',
        },
      });
    }

    // 3. Atualiza o status do pedido de troca
    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        managerNotes: notes || null,
      },
      include: {
        assignment: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
              },
            },
          },
        },
        requester: true,
        targetUser: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: reviewerId,
        churchId: deptChurchId || undefined,
        action: 'SWAP_REQUEST_APPROVED',
        targetType: 'SwapRequest',
        targetId: swapRequestId,
        result: 'SUCCESS',
        ip,
        meta: {
          originAssignmentId: swap.assignmentId,
          newUserId: swap.targetUserId,
          targetAssignmentId: swap.targetAssignmentId || null,
        },
      },
    });

    return updated;
  });
}

/**
 * Solicitante cancela pedido de troca enquanto pendente.
 */
export async function cancelSwapRequestWithAudit(params: {
  swapRequestId: string;
  requesterId: string;
  ip?: string;
}) {
  const { swapRequestId, requesterId, ip } = params;

  return await prisma.$transaction(async (tx) => {
    const swap = await tx.swapRequest.findUnique({
      where: { id: swapRequestId },
    });

    if (!swap) {
      throw new Error('Pedido de troca não encontrado.');
    }

    const canCancel = canCancelSwap(swap, requesterId);
    if (!canCancel) {
      throw new Error('Você não pode cancelar este pedido de troca.');
    }

    const updated = await tx.swapRequest.update({
      where: { id: swapRequestId },
      data: {
        status: 'CANCELLED',
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: requesterId,
        action: 'SWAP_REQUEST_CANCELLED',
        targetType: 'SwapRequest',
        targetId: swapRequestId,
        result: 'SUCCESS',
        ip,
      },
    });

    return updated;
  });
}

/**
 * Retorna dados consolidados para o relatório de participação e histórico.
 */
export async function getDepartmentParticipationReport(params: {
  departmentId?: string;
  from?: Date | string;
  to?: Date | string;
  churchId?: string;
}) {
  const { departmentId, from, to, churchId } = params;

  const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 dias padrão
  const toDate = to ? new Date(to) : new Date();

  // 1. Busca departamentos no escopo
  const departments = await prisma.department.findMany({
    where: {
      ...(departmentId ? { id: departmentId } : {}),
      ...(churchId ? { churchId } : {}),
    },
    include: {
      functions: true,
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  // 2. Busca todas as escalas no período
  const assignments = await prisma.assignment.findMany({
    where: {
      slot: {
        startsAt: {
          gte: fromDate,
          lte: toDate,
        },
        ...(departmentId ? { departmentId } : {}),
        ...(churchId ? { department: { churchId } } : {}),
      },
    },
    include: {
      user: true,
      slot: {
        include: {
          department: true,
          function: true,
          program: true,
        },
      },
    },
    orderBy: {
      slot: { startsAt: 'asc' },
    },
  });

  // 3. Indicadores consolidados
  const totalAssignments = assignments.length;
  const confirmedCount = assignments.filter((a) => a.status === 'CONFIRMED').length;
  const declinedCount = assignments.filter((a) => a.status === 'DECLINED').length;
  const substitutedCount = assignments.filter((a) => a.status === 'SUBSTITUTED').length;
  const pendingCount = assignments.filter((a) => a.status === 'PENDING').length;

  const confirmationRate = totalAssignments > 0 ? (confirmedCount / totalAssignments) * 100 : 100;

  // 4. Mapeamento por voluntário
  const volunteerMap = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      departmentNames: string[];
      totalScheduled: number;
      confirmed: number;
      declined: number;
      substituted: number;
      pending: number;
      lastServedAt: Date | null;
    }
  >();

  for (const a of assignments) {
    let stat = volunteerMap.get(a.userId);
    if (!stat) {
      stat = {
        userId: a.userId,
        name: a.user.name,
        email: a.user.email,
        departmentNames: [],
        totalScheduled: 0,
        confirmed: 0,
        declined: 0,
        substituted: 0,
        pending: 0,
        lastServedAt: null,
      };
      volunteerMap.set(a.userId, stat);
    }

    stat.totalScheduled++;
    if (a.status === 'CONFIRMED') stat.confirmed++;
    if (a.status === 'DECLINED') stat.declined++;
    if (a.status === 'SUBSTITUTED') stat.substituted++;
    if (a.status === 'PENDING') stat.pending++;

    if (!stat.departmentNames.includes(a.slot.department.name)) {
      stat.departmentNames.push(a.slot.department.name);
    }

    if (a.status === 'CONFIRMED' || a.status === 'PENDING') {
      if (!stat.lastServedAt || a.slot.startsAt > stat.lastServedAt) {
        stat.lastServedAt = a.slot.startsAt;
      }
    }
  }

  const volunteersSummary = Array.from(volunteerMap.values()).sort(
    (a, b) => b.totalScheduled - a.totalScheduled
  );

  return {
    period: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    totals: {
      totalAssignments,
      confirmedCount,
      declinedCount,
      substitutedCount,
      pendingCount,
      confirmationRate: Math.round(confirmationRate * 10) / 10,
    },
    volunteers: volunteersSummary,
    departments: departments.map((d) => ({ id: d.id, name: d.name })),
  };
}

/**
 * Gera a pré-visualização de escala automática para os slots em aberto de um programa.
 */
export async function previewAutoSchedule(params: {
  programId: string;
  departmentId?: string;
  actorId?: string;
  ip?: string;
}) {
  const { programId, departmentId, actorId, ip } = params;

  // 1. Busca os slots do programa
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      slots: {
        where: departmentId ? { departmentId } : undefined,
        include: {
          department: true,
          function: true,
          assignments: {
            where: {
              status: { notIn: ['DECLINED', 'SUBSTITUTED'] },
            },
            select: { id: true, userId: true },
          },
        },
        orderBy: {
          startsAt: 'asc',
        },
      },
    },
  });

  if (!program) {
    throw new Error('Programa não encontrado.');
  }

  // 2. Busca voluntários ativos
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const activeUsers = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      ...(program.churchId ? { churchId: program.churchId } : {}),
      ...(departmentId
        ? {
            memberships: {
              some: { departmentId },
            },
          }
        : {}),
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
          status: { in: ['CONFIRMED', 'PENDING', 'PENDING_APPROVAL'] },
        },
        include: {
          slot: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              departmentId: true,
            },
          },
        },
      },
    },
  });

  // 3. Monta lista de slots no formato puro de domínio
  const domainSlots: AutoScheduleSlotInput[] = program.slots.map((s) => ({
    id: s.id,
    title: s.title,
    departmentId: s.departmentId,
    functionId: s.functionId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    requiredCount: s.requiredCount,
    currentAssignments: s.assignments.map((a) => ({ userId: a.userId })),
  }));

  // 4. Monta lista de candidatos com histórico
  const domainCandidates: CandidateWithHistory[] = activeUsers.map((u) => {
    // Escalas nos últimos 60 dias
    const pastAssignments = u.assignments.filter(
      (a) => a.slot.startsAt >= sixtyDaysAgo && a.slot.startsAt <= now
    );
    const lastAssignment = u.assignments
      .filter((a) => a.slot.startsAt <= now)
      .sort((a, b) => b.slot.startsAt.getTime() - a.slot.startsAt.getTime())[0];

    return {
      id: u.id,
      name: u.name,
      status: u.status,
      departmentMemberships: u.memberships.map((m) => ({
        departmentId: m.departmentId,
        functions: m.functions.map((f) => ({ functionId: f.functionId })),
      })),
      availabilities: u.availabilities.map((av) => ({
        kind: av.kind,
        weekday: av.weekday,
        from: av.from,
        to: av.to,
      })),
      assignments: u.assignments.map((a) => ({
        id: a.id,
        slotId: a.slot.id,
        departmentId: a.slot.departmentId,
        startsAt: a.slot.startsAt,
        endsAt: a.slot.endsAt,
        status: mapStatusForConflictCheck(a.status),
      })),
      assignmentsLast60Days: pastAssignments.length,
      lastAssignmentDate: lastAssignment?.slot.startsAt || null,
    };
  });

  // 5. Executa a inteligência de escala pura de domínio
  const scheduleResult = generateProgramSchedule({
    slots: domainSlots,
    candidates: domainCandidates,
  });

  // 6. Auditoria de geração preliminar
  if (actorId) {
    await prisma.auditLog.create({
      data: {
        actorId,
        churchId: program.churchId || undefined,
        action: 'AUTO_SCHEDULE_PREVIEW_GENERATED',
        targetType: 'Program',
        targetId: programId,
        result: 'SUCCESS',
        ip,
        meta: {
          totalFilled: scheduleResult.totalFilled,
          unfilledCount: scheduleResult.unfilledSlots.length,
        },
      },
    });
  }

  return {
    program: {
      id: program.id,
      title: program.title,
      date: program.date.toISOString(),
    },
    ...scheduleResult,
  };
}

/**
 * Persiste em lote e com trava atômica as atribuições geradas e aprovadas pelo gestor.
 */
export async function applyAutoScheduleWithLock(params: {
  programId: string;
  assignments: { slotId: string; userId: string }[];
  actorId: string;
  actorRole?: string;
  ip?: string;
}) {
  const { programId, assignments, actorId, actorRole, ip } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Verifica existência do programa
    const program = await tx.program.findUnique({
      where: { id: programId },
      include: {
        slots: {
          include: {
            department: true,
            assignments: {
              where: { status: { notIn: ['DECLINED', 'SUBSTITUTED'] } },
            },
          },
        },
      },
    });

    if (!program) {
      throw new Error('Programa não encontrado.');
    }

    const isPastoralOrElder = actorRole === 'PASTOR' || actorRole === 'ELDER';
    const targetStatus = isPastoralOrElder ? 'PENDING_APPROVAL' : 'PENDING';

    const createdAssignments = [];

    // 2. Itera e valida cada atribuição com lock transacional e verificação de conflito/limite diário
    for (const item of assignments) {
      const slot = program.slots.find((s) => s.id === item.slotId);
      if (!slot) {
        throw new Error(`Slot ${item.slotId} não pertence a este programa.`);
      }

      await acquireUserLock(tx, item.userId);

      // Verifica se o slot já não está cheio
      const currentActiveCount = await tx.assignment.count({
        where: {
          slotId: slot.id,
          status: { notIn: ['DECLINED', 'SUBSTITUTED'] },
        },
      });

      if (currentActiveCount >= slot.requiredCount) {
        continue; // Já preenchido, pula para o próximo
      }

      // Checa se o usuário já não está escalado neste slot
      const alreadyInSlot = await tx.assignment.findFirst({
        where: {
          slotId: slot.id,
          userId: item.userId,
          status: { notIn: ['DECLINED', 'SUBSTITUTED'] },
        },
      });

      if (alreadyInSlot) {
        continue;
      }

      // Revalida elegibilidade do voluntário dentro da transação (anti-race condition)
      const candidateUser = await tx.user.findUnique({
        where: { id: item.userId },
        include: {
          availabilities: true,
          assignments: {
            where: {
              status: { in: ['PENDING', 'CONFIRMED', 'PENDING_APPROVAL'] },
            },
            include: {
              slot: true,
            },
          },
        },
      });

      if (candidateUser) {
        if (candidateUser.status !== 'ACTIVE') {
          continue;
        }
        const unavailablePeriods = (candidateUser.availabilities || [])
          .filter((av) => av.kind === 'UNAVAILABLE_PERIOD' && av.from && av.to)
          .map((av) => ({ from: av.from!, to: av.to! }));

        if (isDateInUnavailablePeriods(slot.startsAt, slot.endsAt, unavailablePeriods)) {
          continue;
        }

        const activeAssignments: UserAssignmentTime[] = (candidateUser.assignments || []).map((a) => ({
          id: a.id,
          slotId: a.slotId,
          departmentId: a.slot.departmentId,
          startsAt: a.slot.startsAt,
          endsAt: a.slot.endsAt,
          status: mapStatusForConflictCheck(a.status),
        }));

        if (
          findConflictingAssignment({ startsAt: slot.startsAt, endsAt: slot.endsAt }, activeAssignments) ||
          wouldExceedDailyLimit(slot.startsAt, activeAssignments)
        ) {
          continue;
        }
      }

      // Cria a escala em estado PENDING ou PENDING_APPROVAL (quando gerada por Pastor/Ancião)
      const newAssignment = await tx.assignment.create({
        data: {
          slotId: slot.id,
          userId: item.userId,
          status: targetStatus,
        },
        include: {
          user: { select: { id: true, name: true } },
          slot: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      });

      createdAssignments.push(newAssignment);
    }

    // Se gerado por Pastor ou Ancião, notifica os gestores dos departamentos envolvidos
    if (isPastoralOrElder && createdAssignments.length > 0) {
      const distinctDeptIds = Array.from(new Set(createdAssignments.map((a) => a.slot.departmentId)));
      const managers = await tx.departmentMember.findMany({
        where: {
          departmentId: { in: distinctDeptIds },
          role: 'MANAGER',
        },
        include: {
          user: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
        },
      });

      for (const mgr of managers) {
        await tx.auditLog.create({
          data: {
            actorId,
            churchId: program.churchId || undefined,
            action: 'SCHEDULE_PENDING_APPROVAL_CREATED',
            targetType: 'Department',
            targetId: mgr.departmentId,
            result: 'SUCCESS',
            ip,
            meta: {
              leaderId: mgr.userId,
              leaderName: mgr.user.name,
              departmentName: mgr.department.name,
              programId,
              programTitle: program.title,
              message: `Escala preliminar gerada pela liderança pastoral aguarda sua revisão e aprovação.`,
            },
          },
        });
      }
    }

    // 3. Auditoria consolidada
    await tx.auditLog.create({
      data: {
        actorId,
        churchId: program.churchId || undefined,
        action: 'AUTO_SCHEDULE_APPLIED',
        targetType: 'Program',
        targetId: programId,
        result: 'SUCCESS',
        ip,
        meta: {
          createdCount: createdAssignments.length,
          requestedCount: assignments.length,
          status: targetStatus,
          requiresLeaderApproval: isPastoralOrElder,
        },
      },
    });

    return {
      success: true,
      createdCount: createdAssignments.length,
      assignments: createdAssignments,
      status: targetStatus,
      requiresLeaderApproval: isPastoralOrElder,
    };
  });
}

export interface CreateMemberParams {
  name: string;
  email: string;
  phonePrimary?: string | null;
  whatsapp?: string | null;
  status?: 'ACTIVE' | 'PENDING';
  isMinor?: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
  departmentId?: string | null;
  functionIds?: string[];
  churchId?: string | null;
  actorId?: string;
  ip?: string;
}

export async function createMemberWithAudit(params: CreateMemberParams) {
  const {
    name,
    email,
    phonePrimary,
    whatsapp,
    status = 'ACTIVE',
    isMinor = false,
    guardianName,
    guardianPhone,
    departmentId,
    functionIds = [],
    churchId,
    actorId,
    ip,
  } = params;

  const normalizedEmail = email.toLowerCase().trim();
  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || null;

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new Error('Já existe um voluntário cadastrado com este e-mail.');
    }

    if (isMinor && (!guardianName || !guardianPhone)) {
      throw new Error('Para voluntários menores de idade, o nome e telefone do responsável são obrigatórios.');
    }

    // Gera senha segura temporária aleatória
    const tempPassword = randomBytes(24).toString('hex') + '!Aa1';
    const passwordHash = hashPassword(tempPassword);

    const user = await tx.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        status,
        phonePrimary: phonePrimary?.trim() || null,
        whatsapp: whatsapp?.trim() || null,
        isMinor,
        guardianName: isMinor ? guardianName?.trim() || null : null,
        guardianPhone: isMinor ? encryptOptionalString(guardianPhone, encryptionKey) : null,
        guardianConsentAt: isMinor ? new Date() : null,
        churchId: churchId || null,
      },
    });

    // Se departamento foi especificado, associa o voluntário
    if (departmentId) {
      const dept = await tx.department.findUnique({
        where: { id: departmentId },
      });

      if (dept) {
        const member = await tx.departmentMember.create({
          data: {
            departmentId,
            userId: user.id,
            role: 'MEMBER',
          },
        });

        if (functionIds.length > 0) {
          for (const funcId of functionIds) {
            await tx.memberFunction.upsert({
              where: {
                memberId_functionId: {
                  memberId: member.id,
                  functionId: funcId,
                },
              },
              update: {},
              create: {
                memberId: member.id,
                functionId: funcId,
              },
            });
          }
        }
      }
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'MEMBER_CREATED',
        targetType: 'User',
        targetId: user.id,
        churchId: churchId || null,
        result: 'SUCCESS',
        ip,
        meta: {
          departmentId: departmentId || null,
          functionsCount: functionIds.length,
          isMinor,
          status,
        },
      },
    });

    return user;
  });
}

export interface BatchImportRow {
  name: string;
  email: string;
  phonePrimary?: string | null;
  whatsapp?: string | null;
  departmentName?: string | null;
  functionName?: string | null;
  isMinor?: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
}

export interface BatchImportMembersParams {
  rows: BatchImportRow[];
  defaultStatus?: 'ACTIVE' | 'PENDING';
  updateExisting?: boolean;
  churchId?: string | null;
  actorId?: string;
  ip?: string;
}

export interface BatchImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function batchImportMembersWithAudit(
  params: BatchImportMembersParams
): Promise<BatchImportResult> {
  const {
    rows,
    defaultStatus = 'ACTIVE',
    updateExisting = false,
    churchId,
    actorId,
    ip,
  } = params;

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || null;

  return await prisma.$transaction(
    async (tx) => {
      // Carrega todos os departamentos e funções da igreja para mapeamento por nome
      const departments = await tx.department.findMany({
        where: churchId ? { churchId } : undefined,
        include: { functions: true },
      });

      const deptMap = new Map<string, (typeof departments)[0]>();
      for (const d of departments) {
        deptMap.set(d.name.toLowerCase().trim(), d);
      }

      // Pré-carrega usuários existentes em lote para eliminar N+1 findUnique por e-mail
      const validEmails = Array.from(
        new Set(
          rows
            .map((r) => r?.email?.toLowerCase().trim())
            .filter((e): e is string => Boolean(e))
        )
      );
      const existingUsersList =
        validEmails.length > 0 && typeof tx.user.findMany === 'function'
          ? await tx.user.findMany({
              where: { email: { in: validEmails } },
            })
          : [];
      const existingUserMap = new Map(
        existingUsersList.map((u) => [u.email.toLowerCase().trim(), u])
      );

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const rowIndex = i + 1;
        const normalizedEmail = row.email?.toLowerCase().trim();

        if (!normalizedEmail || !row.name) {
          errors.push(`Linha ${rowIndex}: Nome ou e-mail ausente.`);
          continue;
        }

        try {
          const existing =
            existingUserMap.get(normalizedEmail) ??
            (typeof tx.user.findUnique === 'function'
              ? await tx.user.findUnique({ where: { email: normalizedEmail } })
              : null);

          let targetUserId: string;

          if (existing) {
            if (updateExisting) {
              const updatedGuardianPhone = row.guardianPhone?.trim()
                ? encryptOptionalString(row.guardianPhone, encryptionKey)
                : existing.guardianPhone;
              await tx.user.update({
                where: { id: existing.id },
                data: {
                  name: row.name.trim(),
                  phonePrimary: row.phonePrimary?.trim() || existing.phonePrimary,
                  whatsapp: row.whatsapp?.trim() || existing.whatsapp,
                  isMinor: row.isMinor ?? existing.isMinor,
                  guardianName: row.guardianName?.trim() || existing.guardianName,
                  guardianPhone: updatedGuardianPhone,
                },
              });
              updated++;
              targetUserId = existing.id;
            } else {
              skipped++;
              targetUserId = existing.id;
            }
          } else {
            const tempPassword = randomBytes(24).toString('hex') + '!Aa1';
            const passwordHash = hashPassword(tempPassword);

            const newUser = await tx.user.create({
              data: {
                name: row.name.trim(),
                email: normalizedEmail,
                passwordHash,
                status: defaultStatus,
                phonePrimary: row.phonePrimary?.trim() || null,
                whatsapp: row.whatsapp?.trim() || null,
                isMinor: Boolean(row.isMinor),
                guardianName: row.isMinor ? row.guardianName?.trim() || null : null,
                guardianPhone: row.isMinor
                  ? encryptOptionalString(row.guardianPhone, encryptionKey)
                  : null,
                guardianConsentAt: row.isMinor ? new Date() : null,
                churchId: churchId || null,
              },
            });
            existingUserMap.set(normalizedEmail, newUser);
            created++;
            targetUserId = newUser.id;
          }

          // Se departamento for informado, busca e vincula
          if (row.departmentName) {
            const dept = deptMap.get(row.departmentName.toLowerCase().trim());
            if (dept) {
              const membership = await tx.departmentMember.upsert({
                where: {
                  userId_departmentId: {
                    userId: targetUserId,
                    departmentId: dept.id,
                  },
                },
                update: {},
                create: {
                  departmentId: dept.id,
                  userId: targetUserId,
                  role: 'MEMBER',
                },
              });

              // Se função for informada, busca dentro do departamento
              if (row.functionName && membership) {
                const fn = dept.functions.find(
                  (f) => f.name.toLowerCase().trim() === row.functionName?.toLowerCase().trim()
                );
                if (fn) {
                  await tx.memberFunction.upsert({
                    where: {
                      memberId_functionId: {
                        memberId: membership.id,
                        functionId: fn.id,
                      },
                    },
                    update: {},
                    create: {
                      memberId: membership.id,
                      functionId: fn.id,
                    },
                  });
                }
              }
            }
          }
        } catch (rowErr: unknown) {
          const msg = rowErr instanceof Error ? rowErr.message : 'Erro ao processar linha';
          errors.push(`Linha ${rowIndex} (${normalizedEmail}): ${msg}`);
        }
      }

      // Auditoria LGPD-compliant: somente contadores consolidados, nenhum dado pessoal
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'MEMBER_BATCH_IMPORTED',
          targetType: 'User',
          targetId: 'batch',
          churchId: churchId || null,
          result: errors.length > 0 && created === 0 && updated === 0 ? 'DENIED' : 'SUCCESS',
          ip,
          meta: {
            totalRows: rows.length,
            created,
            updated,
            skipped,
            errorsCount: errors.length,
          },
        },
      });

      return {
        total: rows.length,
        created,
        updated,
        skipped,
        errors,
      };
    },
    { timeout: 30000 }
  );
}

export interface AdminUpdateMemberParams {
  userId: string;
  actorId: string;
  actorRole: 'ADMIN_MASTER' | 'PASTOR' | 'ELDER' | 'USER';
  actorChurchId?: string | null;
  name?: string;
  email?: string;
  phonePrimary?: string | null;
  whatsapp?: string | null;
  status?: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  globalRole?: 'USER' | 'ELDER' | 'PASTOR' | 'ADMIN_MASTER';
  isMinor?: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  departmentUpdates?: {
    departmentId: string;
    action: 'ADD' | 'REMOVE' | 'UPDATE';
    role?: 'MANAGER' | 'MEMBER';
    functionIds?: string[];
  }[];
  ip?: string;
}

export async function adminUpdateMemberWithAudit(params: AdminUpdateMemberParams) {
  const {
    userId,
    actorId,
    actorRole,
    actorChurchId,
    name,
    email,
    phonePrimary,
    whatsapp,
    status,
    globalRole,
    isMinor,
    guardianName,
    guardianPhone,
    birthDate,
    notes,
    departmentUpdates,
    ip,
  } = params;

  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || null;

  return await prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { functions: true },
        },
      },
    });

    if (!targetUser) {
      throw new Error('Voluntário não encontrado');
    }

    // Validação de Escopo de Congregação (Anti-IDOR)
    if (actorRole === 'ELDER' || actorRole === 'USER') {
      if (actorChurchId && targetUser.churchId && targetUser.churchId !== actorChurchId) {
        throw new Error('Acesso negado: voluntário pertence a outra congregação');
      }
    }

    // Validação de E-mail se alterado
    if (email && email.toLowerCase().trim() !== targetUser.email.toLowerCase().trim()) {
      const existingEmail = await tx.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (existingEmail) {
        throw new Error('Já existe outro voluntário cadastrado com este e-mail');
      }
    }

    // Validação de Menor de Idade
    if (isMinor && (!guardianName || !guardianPhone)) {
      throw new Error('Para voluntários menores de idade, o nome e telefone do responsável são obrigatórios');
    }

    // Atualização atômica dos dados cadastrais (passwordHash e assignments preservados)
    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (name !== undefined) dataToUpdate.name = name.trim();
    if (email !== undefined) dataToUpdate.email = email.toLowerCase().trim();
    if (phonePrimary !== undefined) dataToUpdate.phonePrimary = phonePrimary ? phonePrimary.trim() : null;
    if (whatsapp !== undefined) dataToUpdate.whatsapp = whatsapp ? whatsapp.trim() : null;
    if (status !== undefined) dataToUpdate.status = status;
    if (isMinor !== undefined) {
      dataToUpdate.isMinor = isMinor;
      dataToUpdate.guardianName = isMinor ? guardianName?.trim() || null : null;
      dataToUpdate.guardianPhone = isMinor ? encryptOptionalString(guardianPhone, encryptionKey) : null;
    }
    if (birthDate !== undefined) {
      dataToUpdate.birthDate = birthDate ? new Date(`${birthDate}T00:00:00Z`) : null;
    }
    if (notes !== undefined) dataToUpdate.notes = encryptOptionalString(notes, encryptionKey);

    // Regra 11: Ninguém altera o próprio papel
    if (actorId === userId && globalRole !== undefined && globalRole !== targetUser.globalRole) {
      throw new Error('Operação negada: nenhum usuário pode alterar o próprio papel.');
    }

    // Regra 11: Sempre existir pelo menos um ADMIN_MASTER ativo
    const isDemotingAdmin =
      targetUser.globalRole === 'ADMIN_MASTER' &&
      ((globalRole !== undefined && globalRole !== 'ADMIN_MASTER') ||
        (status !== undefined && status !== 'ACTIVE'));

    if (isDemotingAdmin) {
      const activeAdminCount = await tx.user.count({
        where: {
          globalRole: 'ADMIN_MASTER',
          status: 'ACTIVE',
        },
      });
      if (activeAdminCount <= 1) {
        throw new Error(
          'Operação negada: o sistema deve possuir pelo menos um Administrador Master ativo.'
        );
      }
    }

    // Papel eclesiástico
    if (globalRole !== undefined && globalRole !== targetUser.globalRole) {
      dataToUpdate.globalRole = globalRole;
      if (globalRole === 'ELDER') {
        dataToUpdate.appointedBy = { connect: { id: actorId } };
      } else if (targetUser.globalRole === 'ELDER' && globalRole === 'USER') {
        dataToUpdate.appointedBy = { disconnect: true };
      }
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    // Processamento de departamentos se fornecidos
    let reprocessedAssignmentsCount = 0;
    if (departmentUpdates && departmentUpdates.length > 0) {
      for (const update of departmentUpdates) {
        if (update.action === 'REMOVE') {
          const removalResult = await removeDepartmentMemberInternal(tx, {
            departmentId: update.departmentId,
            userId,
            actorId,
            ip,
          });
          reprocessedAssignmentsCount += removalResult.reprocessedCount;
        } else if (update.action === 'ADD') {
          const existingMem = await tx.departmentMember.findUnique({
            where: { userId_departmentId: { userId, departmentId: update.departmentId } },
          });
          let memberId = existingMem?.id;
          if (!existingMem) {
            const newMem = await tx.departmentMember.create({
              data: {
                userId,
                departmentId: update.departmentId,
                role: update.role || 'MEMBER',
              },
            });
            memberId = newMem.id;
          } else if (update.role && existingMem.role !== update.role) {
            await tx.departmentMember.update({
              where: { id: existingMem.id },
              data: { role: update.role },
            });
          }

          if (memberId && update.functionIds && update.functionIds.length > 0) {
            for (const funcId of update.functionIds) {
              await tx.memberFunction.upsert({
                where: {
                  memberId_functionId: { memberId, functionId: funcId },
                },
                update: {},
                create: { memberId, functionId: funcId },
              });
            }
          }
        } else if (update.action === 'UPDATE') {
          const existingMem = await tx.departmentMember.findUnique({
            where: { userId_departmentId: { userId, departmentId: update.departmentId } },
          });
          if (existingMem) {
            if (update.role && existingMem.role !== update.role) {
              await tx.departmentMember.update({
                where: { id: existingMem.id },
                data: { role: update.role },
              });
            }
            if (update.functionIds) {
              await tx.memberFunction.deleteMany({
                where: { memberId: existingMem.id },
              });
              for (const funcId of update.functionIds) {
                await tx.memberFunction.create({
                  data: { memberId: existingMem.id, functionId: funcId },
                });
              }
            }
          }
        }
      }
    }

    // Auditoria
    await tx.auditLog.create({
      data: {
        actorId,
        churchId: updatedUser.churchId || undefined,
        action: 'MEMBER_UPDATE',
        targetType: 'User',
        targetId: userId,
        result: 'SUCCESS',
        ip,
        meta: {
          fieldsUpdated: Object.keys(dataToUpdate),
          previousRole: targetUser.globalRole,
          newRole: updatedUser.globalRole,
          previousStatus: targetUser.status,
          newStatus: updatedUser.status,
          reprocessedAssignmentsCount,
        },
      },
    });

    return {
      user: updatedUser,
      reprocessedAssignmentsCount,
    };
  });
}










