import { NextResponse } from 'next/server';
import { assignMemberSchema } from '@revezo/contracts';
import { assignMemberWithLock, prisma } from '@revezo/db';
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
    const parsed = assignMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    // Busca o departamento e congregação do slot para validação de escopo e isolamento multi-igreja
    const slot = await prisma.programSlot.findUnique({
      where: { id: parsed.data.slotId },
      select: {
        departmentId: true,
        program: {
          select: { churchId: true },
        },
      },
    });

    if (!slot) {
      return NextResponse.json({ success: false, error: 'Slot não encontrado' }, { status: 404 });
    }

    // Validação estrita de autorização RBAC com escopo de departamento e igreja
    const allowed = can(userContext, 'assignment:create', {
      departmentId: slot.departmentId,
      churchId: slot.program.churchId || undefined,
    });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para escalar neste departamento ou congregação' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    // Executa a atribuição segura com trava e checagem de conflitos/limite diário
    await assignMemberWithLock({
      slotId: parsed.data.slotId,
      userId: parsed.data.userId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atribuir escala';
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
