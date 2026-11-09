import { NextResponse } from 'next/server';
import { createFunctionSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
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
    const parsed = createFunctionSchema.safeParse(body);

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

    const allowed = can(userContext, 'function:create', {
      departmentId: parsed.data.departmentId,
      churchId: dept.churchId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para adicionar funções neste departamento ou congregação' },
        { status: 403 }
      );
    }

    const func = await prisma.departmentFunction.create({
      data: {
        departmentId: parsed.data.departmentId,
        name: parsed.data.name,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        churchId: dept.churchId,
        action: 'FUNCTION_CREATED',
        targetType: 'DepartmentFunction',
        targetId: func.id,
        result: 'SUCCESS',
        meta: { name: func.name, departmentId: func.departmentId },
      },
    });

    return NextResponse.json({ success: true, functionId: func.id });
  } catch (err: unknown) {
    console.error('Erro ao criar função:', err);
    return NextResponse.json(
      { success: false, error: 'Erro ao criar função.' },
      { status: 500 }
    );
  }
}
