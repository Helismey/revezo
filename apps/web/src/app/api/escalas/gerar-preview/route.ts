import { NextResponse } from 'next/server';
import { generateSchedulePreviewSchema } from '@revezo/contracts';
import { previewAutoSchedule, prisma } from '@revezo/db';
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
    const parsed = generateSchedulePreviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { programId, departmentId } = parsed.data;

    const program = await prisma.program.findUnique({
      where: { id: programId },
      select: { churchId: true },
    });

    if (!program) {
      return NextResponse.json({ success: false, error: 'Programa não encontrado' }, { status: 404 });
    }

    const churchId = program.churchId || undefined;

    const isPastoralOrAdmin =
      userContext.globalRole === 'ADMIN_MASTER' ||
      userContext.globalRole === 'PASTOR' ||
      userContext.globalRole === 'ELDER';

    let targetDepartmentId = departmentId;

    if (!isPastoralOrAdmin) {
      // Líder de departamento: só pode gerar e visualizar o seu próprio departamento
      const managedDeptIds = userContext.departmentMemberships
        .filter((m) => m.role === 'MANAGER')
        .map((m) => m.departmentId);

      if (managedDeptIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Apenas líderes de departamento podem gerar escalas automáticas.' },
          { status: 403 }
        );
      }

      if (targetDepartmentId) {
        if (!managedDeptIds.includes(targetDepartmentId)) {
          return NextResponse.json(
            { success: false, error: 'Você só pode gerar escalas para os departamentos sob sua liderança.' },
            { status: 403 }
          );
        }
      } else {
        // Se não especificou na chamada, restringe automaticamente ao primeiro departamento gerenciado
        targetDepartmentId = managedDeptIds[0];
      }
    }

    // Se informou um departamento, valida a permissão direta com escopo de depto e igreja
    if (targetDepartmentId) {
      const allowed = can(userContext, 'assignment:create', { departmentId: targetDepartmentId, churchId });
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: 'Você não tem permissão para gerar escalas deste departamento' },
          { status: 403 }
        );
      }
    } else {
      // Se não informou departamento (geração geral do programa por Pastor/Ancião), valida autorização hierárquica
      const isAuthorized =
        userContext.globalRole === 'ADMIN_MASTER' ||
        (userContext.globalRole === 'PASTOR' && (!churchId || Boolean(userContext.pastorChurchIds?.includes(churchId)))) ||
        (userContext.globalRole === 'ELDER' && (!churchId || userContext.churchId === churchId));

      if (!isAuthorized) {
        return NextResponse.json(
          { success: false, error: 'Apenas gestores, anciãos ou pastores autorizados podem gerar escalas' },
          { status: 403 }
        );
      }
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const preview = await previewAutoSchedule({
      programId,
      departmentId: targetDepartmentId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar prévia da escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
