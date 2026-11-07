import { NextResponse } from 'next/server';
import { assignManagerSchema } from '@revezo/contracts';
import { assignDepartmentManagerWithAudit, prisma } from '@revezo/db';
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
    const parsed = assignManagerSchema.safeParse(body);

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

    const allowed = can(userContext, 'manager:assign', { churchId: dept.churchId || undefined });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para nomear gestores nesta congregação' },
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

    await assignDepartmentManagerWithAudit({
      departmentId: parsed.data.departmentId,
      userId: parsed.data.userId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao definir gestor do departamento';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
