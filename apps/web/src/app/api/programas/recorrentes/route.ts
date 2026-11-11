import { NextResponse } from 'next/server';
import { createBatchProgramsSchema } from '@revezo/contracts';
import { createBatchProgramsWithAudit } from '@revezo/db';
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
    const parsed = createBatchProgramsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados de programação em lote inválidos' },
        { status: 400 }
      );
    }

    const allowed = can(userContext, 'program:create', {
      churchId: activeChurchId || undefined,
      departmentIds: parsed.data.departmentIds,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para criar programas para estes departamentos ou congregação' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await createBatchProgramsWithAudit({
      title: parsed.data.title,
      churchId: activeChurchId || null,
      departmentIds: parsed.data.departmentIds,
      time: parsed.data.time,
      recurrence: parsed.data.recurrence,
      slots: parsed.data.slots,
      actorId: session.userId,
      actorRole: userContext.globalRole,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      count: result.createdCount,
      recurrenceGroupId: result.recurrenceGroupId,
      message: `${result.createdCount} programa(s) recorrente(s) criado(s) com sucesso! Notificações enviadas aos líderes dos departamentos.`,
    });
  } catch (err: unknown) {
    console.error('Erro ao criar programas recorrentes:', err);
    const msg = err instanceof Error ? err.message : 'Erro ao processar criação de programas em lote';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
