import { NextResponse } from 'next/server';
import { applyAutoScheduleSchema } from '@revezo/contracts';
import { applyAutoScheduleWithLock, prisma } from '@revezo/db';
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
    const parsed = applyAutoScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { programId, assignments } = parsed.data;

    const program = await prisma.program.findUnique({
      where: { id: programId },
      select: { churchId: true },
    });

    if (!program) {
      return NextResponse.json({ success: false, error: 'Programa não encontrado' }, { status: 404 });
    }

    const churchId = program.churchId || undefined;

    // Valida autorização para os departamentos dos slots afetados e congregação
    const slotIds = assignments.map((a) => a.slotId);
    const slots = await prisma.programSlot.findMany({
      where: { id: { in: slotIds } },
      select: { departmentId: true },
    });

    const uniqueDepartmentIds = Array.from(new Set(slots.map((s) => s.departmentId)));

    for (const deptId of uniqueDepartmentIds) {
      const allowed = can(userContext, 'assignment:create', { departmentId: deptId, churchId });
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: 'Você não tem permissão para aplicar escalas em um ou mais departamentos envolvidos nesta congregação' },
          { status: 403 }
        );
      }
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await applyAutoScheduleWithLock({
      programId,
      assignments,
      actorId: session.userId,
      actorRole: userContext.globalRole,
      ip: clientIp,
    });

    const isPastoralOrElder = userContext.globalRole === 'PASTOR' || userContext.globalRole === 'ELDER';
    const message = isPastoralOrElder
      ? `${result.createdCount} escala(s) gerada(s) com pendência para aprovação dos líderes de departamento!`
      : `${result.createdCount} escala(s) gerada(s) e atribuída(s) com sucesso!`;

    return NextResponse.json({
      success: true,
      data: result,
      message,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao aplicar geração automática de escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
