import { NextResponse } from 'next/server';
import {
  addDepartmentMemberSchema,
  updateDepartmentMemberSchema,
  removeDepartmentMemberSchema,
} from '@revezo/contracts';
import {
  addDepartmentMemberWithAudit,
  updateDepartmentMemberWithAudit,
  removeDepartmentMemberWithAudit,
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
    const parsed = addDepartmentMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const dept = await prisma.department.findUnique({
      where: { id: parsed.data.departmentId },
      select: { churchId: true },
    });

    if (!dept) {
      return NextResponse.json({ success: false, error: 'Departamento não encontrado' }, { status: 404 });
    }

    const allowed = can(userContext, 'department:member:add', {
      departmentId: parsed.data.departmentId,
      churchId: dept.churchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para gerenciar a equipe deste departamento ou congregação' },
        { status: 403 }
      );
    }

    // Valida se o voluntário pertence à mesma congregação do departamento
    const targetUser = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { churchId: true },
    });

    if (dept.churchId && targetUser?.churchId && dept.churchId !== targetUser.churchId) {
      return NextResponse.json(
        { success: false, error: 'O voluntário indicado pertence a outra congregação' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const member = await addDepartmentMemberWithAudit({
      departmentId: parsed.data.departmentId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      functionIds: parsed.data.functionIds,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({ success: true, memberId: member.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao adicionar voluntário ao departamento';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
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
    const parsed = updateDepartmentMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const dept = await prisma.department.findUnique({
      where: { id: parsed.data.departmentId },
      select: { churchId: true },
    });

    if (!dept) {
      return NextResponse.json({ success: false, error: 'Departamento não encontrado' }, { status: 404 });
    }

    const allowed = can(userContext, 'department:member:update', {
      departmentId: parsed.data.departmentId,
      churchId: dept.churchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para alterar a equipe deste departamento ou congregação' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    await updateDepartmentMemberWithAudit({
      departmentId: parsed.data.departmentId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      functionIds: parsed.data.functionIds,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar funções do voluntário';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
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
    const parsed = removeDepartmentMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const dept = await prisma.department.findUnique({
      where: { id: parsed.data.departmentId },
      select: { churchId: true },
    });

    if (!dept) {
      return NextResponse.json({ success: false, error: 'Departamento não encontrado' }, { status: 404 });
    }

    const allowed = can(userContext, 'department:member:remove', {
      departmentId: parsed.data.departmentId,
      churchId: dept.churchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para remover voluntários deste departamento ou congregação' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await removeDepartmentMemberWithAudit({
      departmentId: parsed.data.departmentId,
      userId: parsed.data.userId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      reprocessedCount: result.reprocessedCount,
      substitutedCount: result.substitutedCount,
      openedSlotsCount: result.openedSlotsCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao remover voluntário do departamento';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
