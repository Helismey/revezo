import { NextResponse } from 'next/server';
import { prisma } from '@revezo/db';
import { getSession, getCurrentUserContext } from '@/lib/auth-service';
import { can, exportMemberData } from '@revezo/domain';

export async function GET() {
  try {
    const session = await getSession();
    const userContext = await getCurrentUserContext();

    if (!session || !userContext) {
      return NextResponse.json({ success: false, error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const allowed = can(userContext, 'profile:export:own', { targetUserId: session.userId });
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Você não tem permissão para exportar estes dados.' },
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
        assignments: {
          include: {
            slot: {
              include: {
                program: true,
                department: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        availabilities: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 });
    }

    // Geração do arquivo seguro em conformidade com o Art. 18 da LGPD
    const encryptionKey = process.env.FIELD_ENCRYPTION_KEY || process.env.AUTH_SECRET;
    const exportedPayload = exportMemberData(user as any, encryptionKey);

    // Trilha de auditoria
    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'LGPD_DATA_EXPORTED',
        targetType: 'User',
        targetId: session.userId,
        result: 'SUCCESS',
      },
    });

    const fileContent = JSON.stringify(exportedPayload, null, 2);
    const fileName = `revezo-meus-dados-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: unknown) {
    console.error('Erro ao exportar dados do membro (LGPD):', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao gerar o arquivo de exportação de dados.' },
      { status: 500 }
    );
  }
}
