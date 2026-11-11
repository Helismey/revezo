import { NextResponse } from 'next/server';
import { confirmImportMembersSchema } from '@revezo/contracts';
import { batchImportMembersWithAudit } from '@revezo/db';
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

    if (!can(userContext, 'member:import', { churchId: activeChurchId || undefined })) {
      return NextResponse.json(
        { success: false, error: 'Apenas administradores, pastores e anciãos autorizados podem importar membros por planilha' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = confirmImportMembersSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await batchImportMembersWithAudit({
      rows: parsed.data.rows,
      defaultStatus: parsed.data.defaultStatus,
      updateExisting: parsed.data.updateExisting,
      churchId: activeChurchId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao confirmar importação de membros';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
