import { NextResponse } from 'next/server';
import { adminCreateMemberSchema, adminUpdateMemberSchema } from '@revezo/contracts';
import { createMemberWithAudit, adminUpdateMemberWithAudit, prisma } from '@revezo/db';
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
    const parsed = adminCreateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { departmentId } = parsed.data;

    const allowed = can(userContext, 'member:create', {
      churchId: activeChurchId || undefined,
      departmentId: departmentId || undefined,
    });

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para cadastrar voluntários neste departamento/congregação' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const user = await createMemberWithAudit({
      ...parsed.data,
      churchId: activeChurchId,
      actorId: session.userId,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      memberId: user.id,
      name: user.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar voluntário';
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
    const parsed = adminUpdateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { userId, globalRole } = parsed.data;

    // Busca o voluntário alvo para verificar congregação e departamentos
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          select: { departmentId: true },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Voluntário não encontrado' }, { status: 404 });
    }

    const targetDeptIds = targetUser.memberships.map((m) => m.departmentId);

    // Validação de Permissão RBAC
    const allowed = can(userContext, 'profile:update:other', {
      targetUserId: targetUser.id,
      churchId: targetUser.churchId || undefined,
      departmentIds: targetDeptIds,
      newRole: globalRole,
      createdByRole: targetUser.globalRole,
    });

    if (!allowed) {
      if (userContext.globalRole === 'ELDER' && globalRole) {
        return NextResponse.json(
          { success: false, error: 'Acesso negado: Anciãos só podem atribuir cargos para os níveis abaixo do seu' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para alterar este voluntário ou seu papel' },
        { status: 403 }
      );
    }

    // Regra eclesiástica: Pastor não promove para ADMIN_MASTER
    if (userContext.globalRole === 'PASTOR' && globalRole === 'ADMIN_MASTER') {
      return NextResponse.json(
        { success: false, error: 'Acesso negado: Pastores não podem promover para Administrador Master' },
        { status: 403 }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    const result = await adminUpdateMemberWithAudit({
      userId,
      actorId: userContext.id,
      actorRole: userContext.globalRole,
      actorChurchId: userContext.churchId,
      name: parsed.data.name,
      email: parsed.data.email,
      phonePrimary: parsed.data.phonePrimary,
      whatsapp: parsed.data.whatsapp,
      status: parsed.data.status,
      globalRole: parsed.data.globalRole,
      isMinor: parsed.data.isMinor,
      guardianName: parsed.data.guardianName,
      guardianPhone: parsed.data.guardianPhone,
      birthDate: parsed.data.birthDate,
      notes: parsed.data.notes,
      departmentUpdates: parsed.data.departmentUpdates,
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        globalRole: result.user.globalRole,
        status: result.user.status,
      },
      reprocessedAssignmentsCount: result.reprocessedAssignmentsCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar dados do voluntário';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
