import { NextResponse } from 'next/server';
import {
  approveScheduleSchema,
  adjustAndApproveScheduleSchema,
  rejectScheduleSchema,
} from '@revezo/contracts';
import {
  approveScheduleAssignmentsWithAudit,
  adjustAndApproveScheduleAssignmentWithAudit,
  rejectScheduleAssignmentsWithAudit,
  prisma,
} from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = approveScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { assignmentIds } = parsed.data;

    // Busca as escalas para checar permissão departamental
    const assignments = await prisma.assignment.findMany({
      where: { id: { in: assignmentIds } },
      include: {
        slot: {
          include: { department: true },
        },
      },
    });

    if (assignments.length === 0) {
      return NextResponse.json({ success: false, error: 'Escalas não encontradas' }, { status: 404 });
    }

    for (const asg of assignments) {
      const allowed = can(userContext, 'schedule:approve', {
        departmentId: asg.slot.departmentId,
        churchId: asg.slot.department.churchId || undefined,
      });

      if (!allowed) {
        return NextResponse.json(
          { success: false, error: `Você não tem permissão para aprovar escalas do departamento ${asg.slot.department.name}.` },
          { status: 403 }
        );
      }
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await approveScheduleAssignmentsWithAudit({
      assignmentIds,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.approvedCount} escala(s) aprovada(s) com sucesso! Notificações liberadas para os voluntários.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao aprovar escalas';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = adjustAndApproveScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { assignmentId, newUserId } = parsed.data;

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        slot: {
          include: { department: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ success: false, error: 'Escala não encontrada' }, { status: 404 });
    }

    const allowed = can(userContext, 'schedule:approve', {
      departmentId: assignment.slot.departmentId,
      churchId: assignment.slot.department.churchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para ajustar escalas deste departamento.' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await adjustAndApproveScheduleAssignmentWithAudit({
      assignmentId,
      newUserId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Voluntário ajustado e escala aprovada com sucesso!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao ajustar e aprovar escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = rejectScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { assignmentIds, reason } = parsed.data;

    const assignments = await prisma.assignment.findMany({
      where: { id: { in: assignmentIds } },
      include: {
        slot: {
          include: { department: true },
        },
      },
    });

    if (assignments.length === 0) {
      return NextResponse.json({ success: false, error: 'Escalas não encontradas' }, { status: 404 });
    }

    for (const asg of assignments) {
      const allowed = can(userContext, 'schedule:approve', {
        departmentId: asg.slot.departmentId,
        churchId: asg.slot.department.churchId || undefined,
      });

      if (!allowed) {
        return NextResponse.json(
          { success: false, error: `Você não tem permissão para rejeitar escalas do departamento ${asg.slot.department.name}.` },
          { status: 403 }
        );
      }
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await rejectScheduleAssignmentsWithAudit({
      assignmentIds,
      reason,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.rejectedCount} escala(s) pendente(s) rejeitada(s) e removida(s).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao rejeitar escalas';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
