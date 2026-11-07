import { NextResponse } from 'next/server';
import { createDepartmentSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext, getActiveChurchContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const churchContext = await getActiveChurchContext();
    const activeChurchId = churchContext?.activeChurch?.id || userContext.churchId;

    const body = await request.json();
    const parsed = createDepartmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const allowed = can(userContext, 'department:create', { churchId: activeChurchId || undefined });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para criar departamentos nesta congregação' },
        { status: 403 }
      );
    }

    const dept = await prisma.department.create({
      data: {
        name: parsed.data.name,
        churchId: activeChurchId || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        churchId: activeChurchId || null,
        action: 'DEPARTMENT_CREATED',
        targetType: 'Department',
        targetId: dept.id,
        result: 'SUCCESS',
        meta: { name: dept.name },
      },
    });

    return NextResponse.json({ success: true, departmentId: dept.id });
  } catch (err: unknown) {
    console.error('Erro ao criar departamento:', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao criar departamento.' },
      { status: 500 }
    );
  }
}
