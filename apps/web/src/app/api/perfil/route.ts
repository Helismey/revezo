import { NextResponse } from 'next/server';
import { updateMemberSchema } from '@revezo/contracts';
import { prisma, updateUserProfileWithAudit } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can } from '@revezo/domain';

export async function GET() {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const allowed = can(userContext, 'profile:view:own', { targetUserId: session.userId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para visualizar este perfil.' },
        { status: 403 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          include: {
            department: true,
            functions: {
              include: { function: true },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl,
        birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
        gender: user.gender,
        maritalStatus: user.maritalStatus,
        phonePrimary: user.phonePrimary,
        phoneSecondary: user.phoneSecondary,
        whatsapp: user.whatsapp,
        address: user.address,
        emergencyContact: user.emergencyContact,
        joinedAt: user.joinedAt ? user.joinedAt.toISOString().split('T')[0] : null,
        preferredChannel: user.preferredChannel,
        notes: user.notes,
        status: user.status,
        globalRole: user.globalRole,
        optOutWhatsapp: user.optOutWhatsapp,
        optOutEmail: user.optOutEmail,
        optOutPush: user.optOutPush,
        optOutSms: user.optOutSms,
        memberships: user.memberships.map((m) => ({
          departmentId: m.departmentId,
          departmentName: m.department.name,
          role: m.role,
          functions: m.functions.map((f) => ({
            id: f.function.id,
            name: f.function.name,
          })),
        })),
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao buscar perfil do usuário:', error);
    return NextResponse.json(
      { success: false, error: 'Não foi possível carregar os dados do perfil. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const allowed = can(userContext, 'profile:update:own', { targetUserId: session.userId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para editar este perfil.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateMemberSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Verifique os dados preenchidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || undefined;

    const updatedUser = await updateUserProfileWithAudit({
      userId: session.userId,
      data: parsed.data,
      actorId: session.userId,
      ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Seu perfil foi atualizado com sucesso.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        photoUrl: updatedUser.photoUrl,
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao atualizar perfil do usuário:', error);
    const message = error instanceof Error ? error.message : 'Erro ao salvar alterações no perfil.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
