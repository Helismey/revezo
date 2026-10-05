import { NextResponse } from 'next/server';
import { removeAssignmentSchema } from '@revezo/contracts';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can, buildAssignmentScopeWhere } from '@revezo/domain';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = removeAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    // Consulta já filtrada por escopo direto no banco (Anti-IDOR conforme Regra 11)
    const scopeWhere = buildAssignmentScopeWhere(userContext, 'assignment:delete');
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: parsed.data.assignmentId,
        ...scopeWhere,
      },
      include: {
        slot: {
          include: {
            program: {
              select: { churchId: true },
            },
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: 'Escala não encontrada ou fora do seu escopo de permissão' },
        { status: 404 }
      );
    }

    const churchId = assignment.slot.program?.churchId || undefined;

    await prisma.assignment.delete({
      where: { id: assignment.id },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        churchId,
        action: 'ASSIGNMENT_DELETED',
        targetType: 'Assignment',
        targetId: assignment.id,
        result: 'SUCCESS',
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao remover escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
